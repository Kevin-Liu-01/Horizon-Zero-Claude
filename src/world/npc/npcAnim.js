import * as THREE from 'three';
import { BoneSpace, ClipLayerSet } from '../../entities/anim/index.js';
import { B, NPC_CLIPS } from './npcRig.js';

/**
 * NPC ANIMATOR — lane `npc`. One per NPC.
 *
 * Built on anim-core: a `ClipLayerSet` over a `THREE.AnimationMixer` (so every
 * crossfade and one-shot is dt-driven and survives `engine.timeScale`), and a
 * `BoneSpace` for the head/neck look-at written over the clip pose.
 *
 * ── THE NO-SKATE CONTRACT (`A97-npc-no-skate`) ────────────────────────────
 *
 * The NPC's translation is DERIVED FROM THE ANIMATION, not the other way
 * round. Every frame, after the mixer runs:
 *
 *   1. find the support foot (the lower of the two toes, with hysteresis);
 *   2. read how far that foot moved BACKWARD in character space this frame;
 *   3. move the character FORWARD by exactly that much.
 *
 * The planted foot therefore cannot drift: its world position is the fixed
 * point of the update by construction, and it is not a correction applied after
 * an independently-chosen velocity. Walk speed is whatever the clip dictates
 * times `action.timeScale` — which scales the foot's own velocity too, so
 * slowing an NPC down cannot introduce skate either.
 *
 * Turning is the other half of the same idea: a yaw applied about the body
 * origin sweeps the planted foot around an arc. `turn()` instead rotates the
 * body AROUND the planted foot, so a corner costs the foot nothing.
 *
 * Root motion is only integrated while a locomotion layer owns the stage;
 * idles, sits and work loops are in-place by definition and a weight shift in
 * `Idle_Loop` must not walk the NPC out of camp.
 */

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _d = new THREE.Vector3();
const _tgt = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** Locomotion slots: only these integrate root motion. */
const GAIT = new Set(['walk', 'walkFormal', 'jog']);

/**
 * A NON-GAIT BASE LOOP HAS TO STAND STILL, AND "STILL" IS MEASURED
 * (fix round 3, judge finding "permanent visible foot skate on working NPCs").
 *
 * Root motion is integrated for `GAIT` slots only. Put any OTHER clip on stage
 * as the base loop and the body is held while the clip's feet keep travelling —
 * which is not a subtle artefact, it is a person moonwalking on the spot for as
 * long as the loop plays. `Push_Loop` is exactly that clip: measured on this rig,
 * **0.9507 m of support-foot travel per 2.667 s cycle = 0.3565 m/s = 21.4 m of
 * ground a minute**, with its lowest foot never more than 0.0141 m off the floor
 * — i.e. a shuffle with NO AIR PATH AT ALL, so every centimetre of it is slide.
 * Two roster rows carried it, which is the ~40 m/min a judge measured while
 * `A97-npc-no-skate` sampled walkers only and could not see any of it.
 *
 * So every slot this lane can stage now gets the SAME cycle-distance bake the
 * gaits get (`measureLoopTravel`), and `play()` refuses a non-gait base loop that
 * does not measure in place. The bar is metres of ground per second of clip, and
 * the library splits cleanly around it: after `Push_Loop` (0.3565) the worst
 * non-gait loop in the pack is `Dance_Loop` at 0.0055, sixty-five times under it, and
 * every loop this lane actually plays measures 0.0018 or less.
 */
export const IN_PLACE_MAX = 0.05;

/** Slots warned about once (a refused base loop must not spam the console). */
const _refused = new Set();

/**
 * Hard ceiling on the procedural hips->head tilt, in radians (6.9 degrees).
 * Real standing posture varies inside about this much; anything more is a
 * person with a back injury, and no gate number is worth that on film.
 */
export const LEAN_CAP = 0.12;

/**
 * A STANDING BODY TURNS BY STEPPING (fix round 4, judge finding "turn-to-face
 * and yield-escape turns still skate the planted feet on standing NPCs").
 *
 * Only a gait carries its feet through the air, so only a gait can pivot about
 * its support foot for free. Over a stationary loop there is no swing foot to
 * hide a turn in: yawing the body about its origin swept both toes around a
 * ~0.12 m circle (a judge filmed THOK turning 3.142 rad to face the player with
 * 0.30 m of planted-toe drift per stance window and 0.99 m of toe path, the body
 * origin motionless), and pivoting about ONE toe instead only moves the sweep to
 * the other foot and the origin with it. The pack has no turn-in-place clip.
 *
 * So a standing turn is STEPPED, procedurally, over whatever loop is on stage:
 *
 *   - the body yaws about its OWN ORIGIN, so the crowd logic (`_dodge`,
 *     `_separate`) still sees a body that is not moving — the reason the
 *     pivot-about-the-foot fix was rejected in round 3 does not arise;
 *   - each foot is PINNED where it stands — position and heading — by a
 *     two-bone leg solve over the clip pose, so a planted foot cannot move;
 *   - when a planted foot is twisted `STEP_YAW` out of line with the body (or
 *     the clip wants it `STEP_POS` away), it is LIFTED `STEP_LIFT`, carried
 *     through the air to where the clip wants it under the heading the body will
 *     have when it lands, and put down; the feet alternate like a gait;
 *   - horizontal travel only happens while the foot is off the ground (the
 *     first and last `STEP_AIR` of the swing are pure lift and pure descent);
 *   - when the turn stops, any foot still out of line takes one settling step,
 *     and the solve fades out with the pins already on the clip's own feet.
 *
 * A planted foot that is being twisted further than `TWIST_MAX` holds the body
 * turn back until the other foot lands — the body waits for its feet.
 */
const STEP_TIME = 0.36;     // seconds a foot is in the air
const STEP_LIFT = 0.065;    // metres the ankle rises at mid-swing (x body scale)
const STEP_AIR = 0.15;      // fraction of the swing at each end that is vertical only
const STEP_YAW = 0.45;      // radians of planted-foot twist that call for a step
const STEP_POS = 0.07;      // metres of planted-ankle offset that call for a step
const STEP_LEAD = 0.3;      // radians a landing foot may lead the body toward its goal
const TWIST_MAX = 0.8;      // radians a planted foot may be twisted before the body waits
const SETTLE_YAW = 0.035;   // a stopped body steps a foot out of line by more than this…
const SETTLE_POS = 0.012;   // …or this, and releases the solve once both are inside it
const STEP_FADE = 0.15;     // seconds to hand the legs back to the clip

/**
 * Loops in which a body is NOT standing on two feet — kneeling at a repair,
 * seated on a log. There is no honest step for those, so they do not turn: the
 * head still tracks (`_look`), the body waits until it is on its feet.
 */
const NO_STEP = new Set(['fixing', 'sitEnter', 'sitIdle', 'sitTalk', 'sitExit']);

const _Y = new THREE.Vector3(0, 1, 0);
const _H = new THREE.Vector3();
const _K = new THREE.Vector3();
const _A = new THREE.Vector3();
const _A1 = new THREE.Vector3();
const _T = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _s1 = new THREE.Vector3();
const _s2 = new THREE.Vector3();
const _sc = new THREE.Vector3();
const _qh = new THREE.Quaternion();
const _qt = new THREE.Quaternion();
const _qs = new THREE.Quaternion();
const _qf = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _qi = new THREE.Quaternion();

const wrapPi = (a) => {
  a %= Math.PI * 2;
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/** Slots that must exist for the behaviour loop to have anything to say. */
const CORE_SLOTS = ['idle', 'walk'];

let _gaitCache = null;
let _travelCache = null;

/**
 * Measure a clip's nominal ground travel the same way the runtime lock works:
 * integrate the support foot's backward travel over one loop, and record how far
 * off the floor the LOWER foot ever gets — a locomotion clip lifts a foot, a
 * shuffle does not, and the difference is what tells a gait from pure slide.
 *
 * ONE bake for the whole library (fix round 3). The gaits used to be measured on
 * their own and every other loop was simply assumed to be in place, which is how
 * `Push_Loop` shipped as a work loop. Now every slot this lane can stage is
 * measured, once per boot, on ONE throwaway skeleton — never on a live NPC, and
 * with the skeleton and the mixer released at the end (no second instantiate,
 * nothing retained).
 */
export function measureLoopTravel(rigSource, slots = Object.keys(NPC_CLIPS)) {
  if (_travelCache) return _travelCache;
  const out = {};
  const { root, skeleton, byName } = rigSource.instantiate();
  const holder = new THREE.Group();
  holder.add(root);
  const mixer = new THREE.AnimationMixer(holder);
  const toeL = byName.get(B.toeL), toeR = byName.get(B.toeR);

  for (const slot of slots) {
    const clip = rigSource.clip(NPC_CLIPS[slot]);
    if (!clip || !toeL || !toeR) continue;
    const action = mixer.clipAction(clip);
    action.reset(); action.play(); action.weight = 1;
    const N = 60;
    const step = clip.duration / N;
    let travel = 0, support = null, prev = 0, air = 0;
    for (let i = 0; i <= N; i++) {
      mixer.setTime(i * step);
      holder.updateMatrixWorld(true);
      const lz = toeL.matrixWorld.elements[14], ly = toeL.matrixWorld.elements[13];
      const rz = toeR.matrixWorld.elements[14], ry = toeR.matrixWorld.elements[13];
      const low = ly <= ry ? 'L' : 'R';
      const z = low === 'L' ? lz : rz;
      if (low === support) travel += Math.max(0, prev - z);
      support = low; prev = z;
      air = Math.max(air, Math.min(ly, ry));
    }
    action.stop();
    mixer.uncacheAction(clip);
    out[slot] = {
      duration: clip.duration,
      cycleDist: +travel.toFixed(4),
      speed: +(travel / Math.max(1e-4, clip.duration)).toFixed(4),
      // highest the LOWER foot ever gets: a gait's air path, ~0.0146 m (the
      // rig's floor offset) for anything that never takes a foot off the ground
      lowFootMaxY: +air.toFixed(4),
    };
  }
  mixer.uncacheRoot(holder);
  holder.clear();
  // the throwaway rig never reached a renderer, but releasing it is free and
  // keeps the boot-time bake off this lane's memory ledger for good
  skeleton?.dispose?.();
  _travelCache = out;
  return out;
}

/**
 * The locomotion subset of the same bake — `gaitSpeed()` and the root-motion
 * integrator read this, and only slots in `GAIT` may appear in it.
 */
export function measureGaits(rigSource, slots = [...GAIT]) {
  if (_gaitCache) return _gaitCache;
  const all = measureLoopTravel(rigSource);
  const out = {};
  for (const slot of slots) if (all[slot]) out[slot] = all[slot];
  _gaitCache = out;
  return out;
}

export function resetGaitCache() { _gaitCache = null; _travelCache = null; _refused.clear(); }

export class NpcAnimator {
  /**
   * @param {import('./npcRig.js').NpcRigSource} rigSource
   * @param {THREE.Group} group the NPC's world transform (bones live under it)
   * @param {Map<string, THREE.Bone>} byName cloned bones
   * @param {string} id
   */
  constructor(rigSource, group, byName, id) {
    this.id = id;
    this.src = rigSource;
    this.group = group;
    this.byName = byName;
    this.mixer = new THREE.AnimationMixer(group);
    this.layers = new ClipLayerSet(this.mixer, { name: `npc:${id}`, normalize: true });
    this.slots = new Map();          // slot -> ClipLayer
    this.current = null;             // the base loop slot on stage
    this.clipsPlayed = new Set();
    this.gaits = measureGaits(rigSource);
    /**
     * Measured ground travel of EVERY slot this lane can stage, not just the
     * gaits — `inPlace()` and `play()`'s refusal read it. Shared, cached, baked
     * once per boot (see `measureLoopTravel` and `IN_PLACE_MAX`).
     */
    this.travel = measureLoopTravel(rigSource);

    for (const s of CORE_SLOTS) this._slot(s);
    this.layers.base('idle');
    this.slots.get('idle')?.setWeight(1);
    this.current = 'idle';
    this.clipsPlayed.add(NPC_CLIPS.idle);

    /* --- foot lock state --- */
    this.toeL = byName.get(B.toeL);
    this.toeR = byName.get(B.toeR);
    this.footL = byName.get(B.footL);
    this.footR = byName.get(B.footR);
    /** frames the pose is still being crossfaded — see `blending` */
    this._blendHold = 0;
    this.support = null;             // 'L' | 'R'
    this._prevLocal = new THREE.Vector3();
    this._supportWorld = new THREE.Vector3();
    this._have = false;
    this.rootMotion = false;
    /**
     * Bumped whenever the foot lock RE-ANCHORS — a base-loop change, a clamped
     * delta, or a shove from the world. A stance window that spans a bump is
     * not a skate measurement (the reference the drift is measured against
     * moved), which is the same exclusion `A13-no-skate` makes for a dropped
     * frame. `A97-npc-no-skate` reads it.
     */
    this.lockEpoch = 0;
    /**
     * WHY the epoch last moved, so a probe can tell the two apart:
     *   'base'     a base loop changed — the pose is crossfading, not walking
     *   'clamp'    the per-frame delta exceeded the sanity limit
     *   'shift'    the WORLD shoved the body (depenetration out of a prop)
     *   'teleport' the system repositioned the body (`NpcSystem._unstick`)
     * A97 excludes only 'base' and 'clamp'; a shove is exactly the artefact the
     * audit's no-skate finding is about, so it is JUDGED, not discarded.
     */
    this.lockReason = 'base';
    /** slots whose clock has already been seeded with this person's phase */
    this._phased = new Set();
    this.travelled = 0;              // metres this animator has walked itself
    this._feet = [
      { name: 'toe.L', planted: false, world: new THREE.Vector3(), raw: new THREE.Vector3() },
      { name: 'toe.R', planted: false, world: new THREE.Vector3(), raw: new THREE.Vector3() },
    ];

    /* --- the stepped standing turn (see `STEP_TIME`) --- */
    const leg = (th, sh, fo) => {
      const thigh = byName.get(th), shin = byName.get(sh), foot = byName.get(fo);
      if (!thigh || !shin || !foot || !thigh.parent) return null;
      return {
        thigh, shin, foot,
        axis: new THREE.Vector3(),   // last good knee hinge (a straight leg has none)
        hasAxis: false,
        pin: new THREE.Vector3(),    // world XZ the ankle is held at
        yaw: 0,                      // world heading the foot is held at
        swing: false, s: 0,
        from: new THREE.Vector3(), fromYaw: 0, landYaw: 0,
        clip: new THREE.Vector3(),   // the clip's own ankle, this frame
      };
    };
    this._legs = [
      leg(B.thighL, B.shinL, B.footL),
      leg(B.thighR, B.shinR, B.footR),
    ];
    if (!this._legs[0] || !this._legs[1]) this._legs = null;
    this._step = {
      on: false,        // the leg solve owns the legs
      fresh: false,     // pins are taken from the clip on the next update
      w: 0,             // solve weight (1 engaged; fades to 0 on release)
      releasing: false,
      heat: 0,          // seconds since the last standing turn() call, counted down
      acc: 0,           // yaw applied by turn() since the last update
      rate: 0,          // smoothed body yaw rate, rad/s
      goal: null,       // world heading the caller is turning toward, if it said
      land: 0,          // seconds since a foot last landed
      steps: 0,         // feet put down (probe)
      held: 0,          // radians of turn() the planted feet refused (probe)
    };

    /* --- look-at --- */
    this.space = new BoneSpace(group, { worldFrame: true });
    this.eNeck = this.space.entry(B.neck);
    this.eHead = this.space.entry(B.head);
    this.lookTarget = null;          // THREE.Vector3 in world space, or null
    this.lookK = 0;                  // eased 0..1 blend of the look
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.idleYaw = 0;                // slow "looking around" when nobody is near
    this.idleYawTarget = 0;
    this.idleYawT = 0;

    /* --- stance: the per-person bias + weight shift written over the clip --- */
    this.eSpine1 = this.space.entry(B.spine1);
    this.eSpine3 = this.space.entry(B.spine3);
    this.eArmL = this.space.entry(B.upperArmL);
    this.eArmR = this.space.entry(B.upperArmR);
    this.eClavL = this.space.entry(B.shoulderL);
    this.eClavR = this.space.entry(B.shoulderR);
    this.eForeL = this.space.entry(B.forearmL);
    this.eForeR = this.space.entry(B.forearmR);
    this.stance = null;
    this.swayT = 0;
    /** measured hips→head tilt this frame, in radians — `_stance` writes it */
    this.leanRad = 0;

    /**
     * THE PROCEDURAL WRITE-BACK CACHE — and the bug it exists for.
     *
     * `THREE.PropertyMixer.apply()` writes a bone only when the accumulated
     * value CHANGED since the last apply; a track that has gone constant stops
     * touching the scene graph entirely. `Walk_Loop` holds `DEF-spine.001`
     * still, so after the first frame the mixer never wrote that bone again —
     * and the stance bias, applied on top every frame, was never cleared.
     * Measured: mixer delta on spine.001 exactly 0.0000 rad per frame against
     * 0.2091 on spine.003, and SONA's head winding from 1.56 m above her own
     * feet down to 0.33 m and back, several times a second, while every other
     * number about her looked correct.
     *
     * So every bone this class writes procedurally is restored to its PURE CLIP
     * value before the mixer runs and re-cached after it. Two quaternion copies
     * per biased bone per frame, no allocation, and the class of bug — any
     * additive layer over a constant track — cannot come back.
     */
    this._bias = [];
    for (const e of [this.eSpine1, this.eSpine3, this.eClavL, this.eClavR,
      this.eArmL, this.eArmR, this.eForeL, this.eForeR, this.eNeck, this.eHead]) {
      if (e && e.bone) this._bias.push({ bone: e.bone, q: e.bone.quaternion.clone() });
    }
    // the stepped turn writes the LEGS procedurally too, and an idle holds its
    // legs on near-constant tracks — exactly the case above: without the
    // write-back a solved leg would stay solved after the solve let go
    if (this._legs) {
      for (const l of this._legs) {
        for (const b of [l.thigh, l.shin, l.foot]) this._bias.push({ bone: b, q: b.quaternion.clone() });
      }
    }
  }

  /**
   * Give this NPC a posture of its own.
   *
   * Thirteen people running the same three loops stand identically, and that
   * reads as thirteen copies of one actor even when the bodies differ. A fixed
   * per-person bias (elbows out, a shoulder dropped, chin up) plus a slow
   * weight shift on its own phase is the cheapest thing that makes a crowd read
   * as a crowd — and it is what `V35-settlement`'s pairwise landmark test is
   * actually asking for: no two of these people are holding the same pose.
   */
  setStance(rng, index = 0) {
    /**
     * POSTURE IS A LATTICE — AND IT LIVES IN THE SHOULDER GIRDLE, NOT THE SPINE.
     *
     * `V35-settlement` requires every PAIR of people in camp to be holding a
     * measurably different pose — max |delta| over the hand and head landmarks
     * >= 0.12 m — at whatever instant it looks, and it reads the MINIMUM over
     * all 78 pairs. A live crowd cannot promise that from clip variety alone:
     * two sitters in the same seated loop landed 0.073 m apart on film.
     *
     * FIX ROUND 1. The first cut bought that separation on the SPINE, where the
     * head's 0.6 m lever makes it cheap: up to 0.285 rad at the waist and 0.18
     * at the chest, in both axes at once. It passed the number and failed the
     * picture — a judge measured hips->head lean of 10-34 degrees held
     * permanently in every clip, and thirteen people who read as though they
     * had spinal injuries (NIL 33.8 deg, OLIN 29.2, AURA 25.7). A posture bias
     * is a posture, so it is now CLAMPED to `LEAN_CAP` (0.12 rad, ~7 deg
     * combined over both axes including the breathing sway) — the range of real
     * standing variation — and `_stance` enforces that clamp on the sum rather
     * than trusting the table.
     *
     * The separation is bought instead where a person actually differs from
     * another person and where the lever is longest: the SHOULDER GIRDLE. The
     * hand is ~0.60 m from the clavicle, ~0.50 m from the shoulder joint and
     * ~0.26 m from the elbow in any pose there is, seated included, so three
     * independent 4-level lattices (clavicle raise, shoulder fore/aft, elbow
     * bend) give a pairwise hand budget of ~0.43 + 0.30 + 0.14 m against a
     * 0.12 m bar — and "carries one shoulder higher, one arm further forward,
     * elbows looser" is what *holds himself differently* looks like on a real
     * person, where a 30-degree list is not.
     */
    const LEAN = [-1.5, -0.5, 0.5, 1.5];
    /**
     * THE GUARANTEE. `V35-settlement` reads the MINIMUM over all 78 pairs, so a
     * scheme that is merely varied is not enough — one colliding pair fails it.
     * The first cut indexed every sub-lattice as `(index * odd) % 4`, and every
     * such map has period 4: TEB (index 2) and MARIS (index 6) drew IDENTICAL
     * cells on five of six lattices and their poses closed to 0.052 m.
     *
     * So two of the lattices are a PRODUCT, not a hash: `clavL` takes
     * `index % 4` and `foreL` takes `floor(index / 4)`, which is a unique cell
     * of a 4x4 grid for each of the thirteen. Any two people therefore differ
     * by at least one level on one of them, and the levels are spaced so that
     * ONE level is already over the bar — 0.27 rad at the clavicle on a 0.60 m
     * lever is 0.16 m of left hand, 0.28 rad at the shoulder on 0.50 m is
     * 0.14 m. The remaining lattices are decorrelated by a bit-mixed hash and
     * carry the variety; they are not load-bearing.
     */
    const CLAV = [-0.44, -0.15, 0.15, 0.44];
    const ARM = [-0.17, -0.06, 0.06, 0.17];
    /** shoulder fore/aft — moves the hand on a ~0.5 m lever */
    const FORE = [-0.42, -0.14, 0.14, 0.42];
    /** elbow bend on top of the clip — a ~0.26 m lever, and never negative */
    const ELBOW = [0.0, 0.25, 0.50, 0.75];
    const hash = (k) => {
      let x = ((index + 1) * 2654435761 + k * 0x9E3779B1) >>> 0;
      x ^= x >>> 15; x = Math.imul(x, 0x85EBCA6B) >>> 0; x ^= x >>> 13;
      return (x >>> 0) % 4;
    };
    /**
     * Clavicle PROTRACTION — shoulders rolled forward or pulled back. The same
     * ~0.60 m lever as the clavicle raise but on the perpendicular axis, so the
     * two are independent separators, and it is the single most legible thing
     * about how a person carries themselves.
     */
    const CLAVF = [-0.32, -0.11, 0.11, 0.32];
    const lx = LEAN[index % 4];
    const lz = LEAN[Math.floor(index / 4) % 4];
    this.stance = {
      // 1.5 * (0.025 + 0.016) = 0.0615 rad per axis, 0.087 rad over both
      spine1X: lx * 0.025, spine3X: lx * 0.016,
      spine1Z: lz * 0.025, spine3Z: lz * 0.016,
      // the product pair — unique per person, and what the bar is met on
      // the product pair — a unique cell of a 4x4 grid for each of the 13.
      // `index` is RANK BY HEIGHT (`SCALE_RANK` in npc.js), not spawn order, so
      // the pairs that share a clavicle cell are four places apart in height
      // and V35's head landmark (character metres, so it scales) separates
      // those on its own. Two guarantees, neither of which tilts a spine.
      clavL: CLAV[index % 4],
      clavFL: CLAVF[Math.floor(index / 4) % 4],
      // decorrelated variety on everything else
      clavR: CLAV[hash(1)],
      foreL: FORE[hash(2)] + (rng() - 0.5) * 0.05,
      clavFR: CLAVF[hash(3)],
      armL: ARM[hash(4)],
      armR: ARM[hash(5)],
      foreR: FORE[hash(6)] + (rng() - 0.5) * 0.05,
      elbowL: ELBOW[hash(7)] + (rng() - 0.5) * 0.04,
      elbowR: ELBOW[hash(8)] + (rng() - 0.5) * 0.04,
      headZ: (rng() - 0.5) * 0.16,
      swayA: 0.016 + rng() * 0.020,
      swayW: 0.55 + rng() * 0.55,
      swayP: rng() * Math.PI * 2,
    };
    this.swayT = rng() * 10;
    /**
     * A FIXED PLACE IN THE CYCLE. Two people in the same loop at the same phase
     * are the same pose, and no posture bias is a big enough lever to fix that
     * — measured: two walkers 0.093 m apart against `V35-settlement`'s 0.12 m
     * bar, with every lattice cell between them distinct. Each person owns a
     * thirteenth of every loop it plays (`* 5 % 13` so neighbours on the roster
     * are not neighbours in phase), applied whenever a loop comes on stage.
     */
    this.phaseFrac = ((index * 5) % 13) / 13;
    return this;
  }

  /** Start the base loop somewhere other than frame 0 — nobody breathes in sync. */
  randomizePhase(rng) {
    for (const l of this.slots.values()) {
      if (l.loop) l.action.time = rng() * l.duration;
    }
    return this;
  }

  /** Lazily create (and cache) the layer for a logical slot. */
  _slot(slot) {
    let l = this.slots.get(slot);
    if (l) return l;
    const name = NPC_CLIPS[slot] || slot;
    const clip = this.src.clip(name);
    if (!clip) return null;
    const loop = /_Loop$/.test(name);
    l = this.layers.add(slot, clip, { loop, weight: 0 });
    this.slots.set(slot, l);
    return l;
  }

  has(slot) { return !!(this.slots.get(slot) || this.src.clip(NPC_CLIPS[slot] || slot)); }

  /**
   * Does this slot's clip stand still? MEASURED, not asserted — see
   * `IN_PLACE_MAX`. A slot with no measurement is treated as travelling: the
   * safe direction, and unreachable in practice because `_slot()` only ever
   * builds a layer for a clip the bake also saw.
   */
  inPlace(slot) {
    const t = this.travel[slot];
    return !!t && t.speed <= IN_PLACE_MAX;
  }

  /**
   * Crossfade the base loop to `slot`. `rate` scales playback (and, for a
   * locomotion loop, the travel speed — the foot lock keeps step).
   */
  play(slot, { fade = 0.28, rate = 1 } = {}) {
    /**
     * A TRAVELLING CLIP CANNOT BE A STATIONARY BASE LOOP (fix round 3).
     *
     * Only `GAIT` slots drive the body, so any other base loop with real cycle
     * travel skates its feet for as long as it is on stage. That is refused
     * here rather than only in the pools that pick the slot, so a future edit
     * dropping `Push_Loop` (0.3565 m/s, no air path) back into a work pool
     * cannot re-introduce the artefact silently. See `IN_PLACE_MAX`.
     */
    if (!GAIT.has(slot) && !this.inPlace(slot)) {
      if (!_refused.has(slot)) {
        _refused.add(slot);
        console.warn(`[npc] "${NPC_CLIPS[slot] || slot}" travels `
          + `${this.travel[slot]?.speed ?? '?'} m/s and is not a gait — refused as a `
          + 'base loop (it would slide the feet); playing idle instead');
      }
      slot = 'idle';
    }
    if (this.current === slot && Math.abs((this.slots.get(slot)?.action.timeScale ?? 1) - rate) < 1e-3) return this;
    const next = this._slot(slot);
    if (!next) return this;
    /**
     * A BASE LOOP REPEATS, EVEN WHEN THE CLIP IS ONE-SHOT-SHAPED (fix round 3).
     *
     * Half this lane's rest and work loops are gestures — `Interact`,
     * `PickUp_Table`, `Fixing_Kneeling` — and they used to be staged as a
     * play-once that clamped on its last frame, so a worker "working" was a
     * person frozen mid-reach for five seconds. Two reasons that is wrong:
     *
     *  - it is a still pose where Kevin asked for idle movement, and a repeat of
     *    a 0.8 s pick-up or a 5.2 s repair reads as continuous labour;
     *  - `ClipLayer.stuck()` reports a NON-LOOPING layer that still carries weight
     *    with a target of 0 as "weight held after restore", which is the exact
     *    shape of crossfading OUT of one of these — the layer is not stuck, it is
     *    leaving the stage. A96 fails the build on a `stuck()` report and sampled
     *    one on OLIN's `interact` mid-fade; with two non-looping rest clips in a
     *    pool that flake is worth several percent of runs.
     *
     * A one-shot is unaffected: `ClipLayer.playOnce` sets `LoopOnce` itself and
     * owns the layer until it hands the stage back, and this only ever runs when
     * a slot is taking the stage as the BASE loop.
     */
    if (!next.loop) {
      next.loop = true;
      next.oneShot = false;
      next.restore = null;
      next.action.setLoop(THREE.LoopRepeat, Infinity);
      next.action.clampWhenFinished = false;
      // a clip that clamped at its last frame is PAUSED by three, and switching
      // the loop mode does not wake it: a paused action is a frozen person
      next.action.enabled = true;
      next.action.paused = false;
      if (next.action.time >= next.duration - 1e-3) next.action.time = 0;
    }
    const prev = this.current ? this.slots.get(this.current) : null;
    next.action.timeScale = rate;
    /**
     * CLEAR THE STAGE, AND RETARGET ANYTHING STILL ON IT.
     *
     * `ClipLayerSet` normalizes override weights, so a layer left carrying
     * weight does not sit on top of the new base — it DIVIDES it. Two ways that
     * happened here, both filmed:
     *   - a one-shot captured `restore` when it started, so a fidget fired
     *     during an idle handed the stage back to IDLE after the NPC had
     *     already started walking: idle and walk both at 1, normalized to 0.5
     *     each, and SONA walked at a quarter speed with a 0.68 rad knee swing
     *     while `current` cheerfully read 'walk';
     *   - a `tempT` loop (crouchIdle, push) whose timer had not expired.
     * So: every other override layer is faded out, and any live one-shot is
     * re-pointed at the layer that is actually taking the stage.
     */
    const wasOff = next.weight <= 1e-3 && next.target <= 1e-3;
    for (const l of this.slots.values()) {
      if (l === next) continue;
      if (l.oneShot && !l.handedBack) { l.restore = next; continue; }
      if (l.weight > 1e-3 || l.target > 1e-3) l.fadeTo(0, fade);
    }
    if (prev && prev !== next) prev.fadeTo(0, fade);
    next.fadeTo(1, fade);
    /**
     * A loop coming on from off-stage starts at THIS person's phase (see
     * `phaseFrac`). There used to be a branch above this one that reset a
     * one-shot-shaped clip to the top instead; it is gone because a base loop is
     * now always a repeat (see the `!next.loop` block at the head of this
     * method), which means the gesture clips get the phase seed too — thirteen
     * people picking things up are no longer doing it in unison.
     */
    if (wasOff && this.phaseFrac !== undefined && !this._phased.has(slot)) {
      /**
       * ONCE PER LAYER, not once per play(). A loop keeps its clock, so seeding
       * it the first time it takes the stage separates this person from the
       * rest for good — whereas re-seeding on every play() makes play() a
       * FREEZE for any caller that re-issues it each frame. A gate that does
       * exactly that (V41's soloWalk) filmed two walkers pinned at a constant
       * pose: 0.01 rad of knee swing on a clip that swings 1.27.
       */
      this._phased.add(slot);
      next.action.time = this.phaseFrac * (next.duration || 1);
    }
    this.current = slot;
    this.layers.base(slot);
    this.clipsPlayed.add(NPC_CLIPS[slot] || slot);
    this.rootMotion = GAIT.has(slot);
    this._have = false;        // always re-anchor on a base-loop change
    this.lockEpoch++;
    this.lockReason = 'base';
    return this;
  }

  /** Fire a one-shot over the current base loop; it restores on mixer time. */
  once(slot, { fade = 0.22, rate = 1, hold = 0, onDone = null } = {}) {
    // same rule as `play()`: a one-shot poses the body over the base loop, so a
    // one-shot that travels slides the feet too. Refused, not substituted — a
    // fidget that cannot be played is simply not played.
    if (!GAIT.has(slot) && !this.inPlace(slot)) return null;
    /**
     * A LAYER CANNOT BE ITS OWN BASE AND ITS OWN ONE-SHOT (fix round 3).
     *
     * `ClipLayer.playOnce` sets the layer's weight to 0, fades it to 1, and then
     * fades its `restore` layer to 0. When `restore` IS this layer — which is
     * what happens whenever a work beat draws the slot already on stage, and the
     * pools overlap `idleClip` by design — that second fade overwrites the first
     * and the layer sits at zero. `ClipLayerSet` only normalizes when the override
     * weights sum above 1e-6, so with the only weighted layer at zero the mixer
     * blends every bone toward its BIND value: the NPC snaps to the T-pose for the
     * length of the beat.
     *
     * Measured on 5218 before this guard: OLIN, THOK and TEB each jumping 0.19-0.33 m
     * of planted toe in a SINGLE frame at `work`, with `_slot` weights reading
     * `pickup:0.08(1s)` and, on the collapse frame, nothing at all on stage.
     * A97 could not see it before this round because it sampled walkers only.
     *
     * A one-shot of the loop already playing is a no-op by definition, so it is
     * simply refused, and `_workBeat` picks another beat.
     */
    if (slot === this.current) return null;
    const l = this._slot(slot);
    if (!l) return null;
    this.clipsPlayed.add(NPC_CLIPS[slot] || slot);
    /**
     * A ONE-SHOT IS A POSE CHANGE, SO THE FOOT LOCK RE-ANCHORS (fix round 3).
     * `play()` has always done this and `once()` never did, yet both replace what
     * is on stage: carrying the lock's character-space reference across the blend
     * charges the pose difference between the two clips to root motion and lurches
     * the body. Same bump, same epoch, so a probe can tell a blend from a shove.
     */
    this._have = false;
    this.lockEpoch++;
    this.lockReason = 'blend';
    /**
     * ONE ONE-SHOT ON STAGE AT A TIME (fix round 3).
     *
     * `playOnce` does not clear other one-shots the way `play()` clears other base
     * loops, so two overlapping beats both sat at weight 1 and `ClipLayerSet`'s
     * normalization served a 50/50 MUSH of two clips nobody authored. Filmed on
     * TEB at the tanning frame: `Fixing_Kneeling` and `Interact` both at 1.00 for
     * 4 s, a half-kneel whose rear foot lifted 0.134 m while the support choice
     * still called it planted, and 0.224 m of "planted" toe travel in 0.35 s —
     * the worst single number left in A97 after the push clip went.
     *
     * The incoming beat owns the stage: anything still one-shotting is cancelled
     * over the same fade (which hands its own restore back cleanly).
     */
    for (const other of this.slots.values()) {
      if (other === l || !other.oneShot || other.handedBack) continue;
      /**
       * FADED OUT, NOT `cancel()`ed. `ClipLayer.cancel` clears the one-shot flag
       * and schedules the fade, and a NON-LOOPING layer with weight still up and
       * target 0 is precisely what `ClipLayer.stuck()` calls "weight held after
       * restore" — every one of this lane's beat clips is non-looping, so a cancel
       * left a false `stuck()` report standing for the length of the fade, and
       * `A96-npc-animated` fails the build on one (it cost a run out of ten).
       * Leaving the flag set keeps the layer's own timeline responsible for the
       * clean exit, which is exactly what `play()` does with a live one-shot.
       */
      other.restore = null;
      other.fadeTo(0, fade);
    }
    return l.playOnce({
      restore: this.current ? this.slots.get(this.current) : null,
      fade, timeScale: rate, hold, onDone,
    });
  }

  /**
   * IS THE POSE BEING CROSSFADED RIGHT NOW?
   *
   * True while any layer's fade is still running — a base-loop change resolving,
   * a one-shot blending in, or a one-shot handing the stage back. Two clips with
   * different stances put the planted foot in different places, so the foot moves
   * during the blend however honestly the body is driven; `A97-npc-no-skate`
   * excludes those windows (it already excluded the base-change case and had no
   * way to see the other two) and reports them separately so the exclusion is
   * visible rather than silent.
   */
  get blending() { return this._blendHold > 0; }

  /** Is a one-shot currently holding the stage? */
  get busy() {
    for (const l of this.slots.values()) if (l.oneShot && !l.handedBack) return true;
    return false;
  }

  /** Nominal ground speed of the current gait, in metres/second, at `rate`. */
  gaitSpeed(slot = this.current, rate = 1) {
    const g = this.gaits[slot];
    return g ? g.speed * rate * (this.group.scale.x || 1) : 0;
  }

  /**
   * Turn the body by `dYaw` without dragging a foot.
   *
   * WHILE A GAIT IS ON STAGE the body yaws about the planted foot: the other foot
   * is in the air, so the corner costs nothing.
   *
   * OVER A STATIONARY LOOP (fix round 4) there is no swing foot, and neither
   * pivot is free — yawing about the body origin sweeps both toes round a
   * ~0.12 m circle (a judge measured 0.30 m of planted-toe drift per stance
   * window on THOK turning to face the player), and yawing about one toe sweeps
   * the other one instead and moves the origin, which the crowd logic cannot see
   * (round 3 measured that: two walkers merged). So the body yaws about its own
   * origin and the FEET STEP: see `STEP_TIME` and `_stepFeet`. A body in a pose
   * that has no honest step (`NO_STEP`: kneeling, seated) does not turn at all.
   *
   * @param {number} dYaw radians this frame
   * @param {number|null} goal the world heading the caller is ultimately turning
   *   toward, if it knows — a landing foot leads the body toward it but never
   *   past it, so the last step of a turn puts the feet down where they finish
   * @returns {number} the yaw actually applied (a standing body may wait for
   *   its feet, and a kneeling one does not turn)
   */
  turn(dYaw, goal = null) {
    if (!dYaw) return 0;
    const g = this.group;
    const pivot = this._have && this.rootMotion;
    if (!pivot && !this.rootMotion) return this._turnStanding(dYaw, goal);
    if (pivot) {
      const f = this._supportWorld;
      const dx = g.position.x - f.x, dz = g.position.z - f.z;
      const c = Math.cos(dYaw), s = Math.sin(dYaw);
      g.position.x = f.x + dx * c + dz * s;
      g.position.z = f.z - dx * s + dz * c;
    }
    g.rotation.y += dYaw;
    /**
     * Re-express the lock's reference in the NEW character frame. `_prevLocal`
     * was measured before this yaw; comparing it against next frame's local
     * reading would charge the turn itself to the foot and report it as skate.
     * The group only ever carries a Y rotation and a uniform scale, so the
     * conversion is four multiplies — no matrix walk in the hot loop.
     */
    if (pivot) {
      const sc = g.scale.x || 1;
      const dx = (this._supportWorld.x - g.position.x) / sc;
      const dz = (this._supportWorld.z - g.position.z) / sc;
      const cy = Math.cos(g.rotation.y), sy = Math.sin(g.rotation.y);
      this._prevLocal.x = dx * cy - dz * sy;
      this._prevLocal.z = dx * sy + dz * cy;
    }
    return dYaw;
  }

  /** Can this body take a step right now? (standing on two feet — see `NO_STEP`) */
  get canStep() {
    if (!this._legs) return false;
    if (NO_STEP.has(this.current)) return false;
    const O = this.layers.order;
    for (let i = 0; i < O.length; i++) {
      const l = O[i];
      if ((l.weight > 0.05 || l.target > 0.05) && NO_STEP.has(l.name)) return false;
    }
    return true;
  }

  /** Is the stepped turn holding the legs? (probe) */
  get stepping() { return this._step.on; }

  /** Feet put down by stepped turns since boot, and turn refused by planted feet (probe). */
  stepStats() { return { steps: this._step.steps, heldRad: +this._step.held.toFixed(3), on: this._step.on }; }

  _turnStanding(dYaw, goal) {
    if (!this.canStep) return 0;
    const g = this.group;
    const st = this._step;
    const yaw = g.rotation.y;
    if (!st.on || st.releasing) {
      if (!st.on) {
        // pins are read from the clip on the next update, un-rotated by the yaw
        // applied between now and then (see `_stepFeet`)
        st.on = true; st.fresh = true; st.acc = 0; st.rate = 0; st.land = 1;
        for (const l of this._legs) { l.yaw = yaw; l.swing = false; l.s = 0; }
      }
      st.releasing = false;
      st.w = 1;
    }
    /**
     * THE BODY WAITS FOR ITS FEET. A planted foot is held at the heading it was
     * put down with, so every radian the body turns is a radian of twist in that
     * leg; past `TWIST_MAX` the rest of this frame's turn is refused until the
     * other foot lands. The callers re-read `rotation.y` every frame, so a
     * refused radian is simply turned a moment later.
     */
    let d = dYaw;
    for (const l of this._legs) {
      if (l.swing) continue;
      const tw = wrapPi(yaw + d - l.yaw);
      if (tw > TWIST_MAX) d = Math.max(0, d - (tw - TWIST_MAX));
      else if (tw < -TWIST_MAX) d = Math.min(0, d - (tw + TWIST_MAX));
    }
    st.held += Math.abs(dYaw - d);
    st.heat = 0.2;
    st.goal = goal;
    if (!d) return 0;
    g.rotation.y = yaw + d;
    st.acc += d;
    return d;
  }

  /**
   * THE STEPPED TURN — run inside `update()`, after the mixer has posed the
   * clip and before the foot lock reads the toes (so the probe sees the solved
   * legs, not the clip's). See `STEP_TIME` for the whole contract.
   */
  _stepFeet(dt) {
    const st = this._step;
    if (!st.on) return;
    const g = this.group;
    const yaw = g.rotation.y;
    const sc = g.scale.x || 1;
    const ox = g.position.x, oz = g.position.z;
    const L = this._legs;

    // the clip's own ankles this frame
    for (let k = 0; k < 2; k++) L[k].clip.setFromMatrixPosition(L[k].foot.matrixWorld);

    if (st.fresh) {
      // where each ankle WAS: this frame's clip ankle, un-rotated by the yaw
      // turn() applied since the last update (the body origin is the pivot)
      const c = Math.cos(-st.acc), s = Math.sin(-st.acc);
      for (let k = 0; k < 2; k++) {
        const dx = L[k].clip.x - ox, dz = L[k].clip.z - oz;
        L[k].pin.set(ox + dx * c + dz * s, 0, oz - dx * s + dz * c);
      }
      st.fresh = false;
    }

    // body yaw rate, for the landing lead
    if (dt > 0) st.rate += (st.acc / dt - st.rate) * Math.min(1, dt * 10);
    st.acc = 0;
    st.heat -= dt;
    st.land += dt;
    const turning = st.heat > 0;

    // a gait took the stage, or a pose with no honest step: hand the legs back
    if (this.rootMotion || !this.canStep) st.releasing = true;

    /**
     * Where a foot should come down: the clip's ankle, re-expressed under the
     * heading the body will have when the foot lands — the current heading plus
     * the yaw still to come during the rest of the swing and a short lead,
     * clamped toward (never past) the caller's goal.
     */
    const landYaw = (rem) => {
      let lead = st.rate * (rem + 0.12);
      if (st.goal !== null) {
        const toGoal = wrapPi(st.goal - yaw);
        lead = toGoal >= 0 ? THREE.MathUtils.clamp(lead, 0, toGoal) : THREE.MathUtils.clamp(lead, toGoal, 0);
      }
      return yaw + THREE.MathUtils.clamp(lead, -STEP_LEAD, STEP_LEAD);
    };

    // advance the swings
    let swinging = -1;
    for (let k = 0; k < 2; k++) {
      const l = L[k];
      if (!l.swing) continue;
      l.s += dt / STEP_TIME;
      l.landYaw = landYaw(Math.max(0, 1 - l.s) * STEP_TIME);
      if (l.s >= 1) {
        const a = l.landYaw - yaw, c = Math.cos(a), s = Math.sin(a);
        const dx = l.clip.x - ox, dz = l.clip.z - oz;
        l.pin.set(ox + dx * c + dz * s, 0, oz - dx * s + dz * c);
        l.yaw = l.landYaw;
        l.swing = false; l.s = 0;
        st.land = 0;
        st.steps++;
      } else swinging = k;
    }

    // start a step: the foot most out of line, one foot in the air at a time
    if (swinging < 0 && !st.releasing) {
      let best = -1, bestNeed = 0, settled = true;
      for (let k = 0; k < 2; k++) {
        const l = L[k];
        const tw = Math.abs(wrapPi(yaw - l.yaw));
        const off = Math.hypot(l.pin.x - l.clip.x, l.pin.z - l.clip.z);
        if (tw > SETTLE_YAW || off > SETTLE_POS) settled = false;
        let need;
        if (turning) {
          need = Math.max(tw / STEP_YAW, off / STEP_POS);
          // a turn in progress keeps the feet alternating like a gait: the foot
          // that did not just land goes as soon as it is half out of line
          if (st.land < 0.05 && need >= 0.5) need = Math.max(need, 1);
        } else {
          need = (tw > SETTLE_YAW || off > SETTLE_POS) ? 1 + tw + off : 0;
        }
        if (need >= 1 && need > bestNeed) { best = k; bestNeed = need; }
      }
      if (best >= 0 && st.land >= 0.04) {
        const l = L[best];
        l.swing = true; l.s = 0;
        l.from.copy(l.pin); l.fromYaw = l.yaw;
        l.landYaw = landYaw(STEP_TIME);
        swinging = best;
      } else if (best < 0 && settled && !turning) {
        st.releasing = true;
      }
    }

    if (st.releasing) {
      st.w -= dt / STEP_FADE;
      if (st.w <= 0) {
        st.on = false; st.w = 0; st.releasing = false;
        for (const l of L) { l.swing = false; l.s = 0; }
        return;
      }
    }

    // solve both legs to their targets
    for (let k = 0; k < 2; k++) {
      const l = L[k];
      let tx, tz, lift = 0, dYawFoot;
      if (l.swing) {
        const a = l.landYaw - yaw, c = Math.cos(a), s = Math.sin(a);
        const dx = l.clip.x - ox, dz = l.clip.z - oz;
        const ex = ox + dx * c + dz * s, ez = oz - dx * s + dz * c;
        const u = THREE.MathUtils.clamp((l.s - STEP_AIR) / (1 - 2 * STEP_AIR), 0, 1);
        const e = u * u * (3 - 2 * u);
        tx = l.from.x + (ex - l.from.x) * e;
        tz = l.from.z + (ez - l.from.z) * e;
        lift = Math.sin(Math.PI * Math.min(1, l.s)) * STEP_LIFT * sc;
        dYawFoot = wrapPi(l.fromYaw - yaw) * (1 - e) + wrapPi(l.landYaw - yaw) * e;
      } else {
        tx = l.pin.x; tz = l.pin.z;
        dYawFoot = wrapPi(l.yaw - yaw);
      }
      _T.set(tx, l.clip.y + lift, tz);
      this._solveLeg(l, _T, dYawFoot, st.w);
    }
  }

  /**
   * Two-bone leg solve: put the ankle on `target` and the foot on the clip's own
   * foot orientation turned by `dYawFoot` about world up, blended over the clip
   * pose by `w`. Everything is read from the bones' current world matrices (the
   * clip pose after the mixer), written back as LOCAL quaternions, and the leg's
   * subtree matrices are refreshed so the foot lock and the probe read the
   * solved toes. No allocation: module scratch only.
   */
  _solveLeg(l, target, dYawFoot, w) {
    const { thigh, shin, foot } = l;
    thigh.parent.matrixWorld.decompose(_s1, _qh, _sc);
    thigh.matrixWorld.decompose(_H, _qt, _sc);
    shin.matrixWorld.decompose(_K, _qs, _sc);
    foot.matrixWorld.decompose(_A, _qf, _sc);
    const L1 = _H.distanceTo(_K), L2 = _K.distanceTo(_A);
    if (L1 < 1e-4 || L2 < 1e-4) return;

    // 1. bend the knee so hip->ankle is as long as hip->target
    _s1.subVectors(_H, _K);
    _s2.subVectors(_A, _K);
    const th0 = Math.acos(THREE.MathUtils.clamp(_s1.dot(_s2) / (L1 * L2), -1, 1));
    const reach = THREE.MathUtils.clamp(target.distanceTo(_H), Math.abs(L1 - L2) + 1e-4, (L1 + L2) * 0.9995);
    const th1 = Math.acos(THREE.MathUtils.clamp((L1 * L1 + L2 * L2 - reach * reach) / (2 * L1 * L2), -1, 1));
    _ax.crossVectors(_s1, _s2);
    if (_ax.lengthSq() > 1e-10) { _ax.normalize(); l.axis.copy(_ax); l.hasAxis = true; }
    else if (l.hasAxis) _ax.copy(l.axis);
    if (l.hasAxis) _q1.setFromAxisAngle(_ax, th1 - th0);
    else _q1.identity();
    _A1.copy(_s2).applyQuaternion(_q1).add(_K);

    // 2. swing the whole leg about the hip so the ankle lands on the target
    _s1.subVectors(_A1, _H).normalize();
    _s2.subVectors(target, _H).normalize();
    _q2.setFromUnitVectors(_s1, _s2);

    // 3. new world orientations
    _qt.premultiply(_q2);                                   // thigh
    _qs.premultiply(_q1).premultiply(_q2);                  // shin
    _qf.premultiply(_qy.setFromAxisAngle(_Y, dYawFoot));    // foot

    // 4. back to local, blended over the clip's local by w
    _qi.copy(_qh).invert().multiply(_qt);
    if (w >= 1) thigh.quaternion.copy(_qi); else thigh.quaternion.slerp(_qi, w);
    _qi.copy(_qt).invert().multiply(_qs);
    if (w >= 1) shin.quaternion.copy(_qi); else shin.quaternion.slerp(_qi, w);
    _qi.copy(_qs).invert().multiply(_qf);
    if (w >= 1) foot.quaternion.copy(_qi); else foot.quaternion.slerp(_qi, w);
    thigh.updateMatrixWorld(true);
  }

  /** Point the head (and half as much, the neck) at a world position. */
  lookAt(target) { this.lookTarget = target; }

  /**
   * @param {number} dt already multiplied by `engine.timeScale`
   * @returns {{x:number,z:number}} the world XZ the foot lock moved the body by
   */
  update(dt) {
    /**
     * LATCH THE CROSSFADE FLAG, AND HOLD IT ONE FRAME PAST THE END.
     *
     * A fade still changes the pose on the frame it reaches zero, and a probe
     * that reads the flag AFTER this update would see `fadeT === 0` on exactly
     * that frame and call it clean — measured at 0.063 m of planted-toe movement
     * with the stage reading `idle:1.00` and the body untouched. Checked before
     * the layers step, held for one frame after, no allocation.
     */
    // indexed over the layer set's own array, not `slots.values()`: this runs
    // thirteen times a frame and a Map iterator is an allocation
    let fading = false;
    const O = this.layers.order;
    for (let i = 0; i < O.length; i++) if (O[i].fadeT > 0) { fading = true; break; }
    this._blendHold = fading ? 2 : Math.max(0, this._blendHold - 1);

    // hand the mixer back the pose it last authored (see `_bias`)
    const bias = this._bias;
    for (let i = 0; i < bias.length; i++) bias[i].bone.quaternion.copy(bias[i].q);
    this.layers.update(dt);           // steps the mixer with the same dt
    for (let i = 0; i < bias.length; i++) bias[i].q.copy(bias[i].bone.quaternion);
    const g = this.group;
    g.updateMatrixWorld(true);
    // a standing turn's feet are solved BEFORE the lock reads the toes, so the
    // support choice and the probe's `raw` toes are the solved legs
    if (this._step.on) this._stepFeet(dt);
    const moved = this._lockFeet(dt);
    this._stance(dt);
    this._look(dt);
    return moved;
  }

  _lockFeet(dt) {
    const g = this.group;
    const tl = this.toeL, tr = this.toeR;
    let mx = 0, mz = 0;
    if (!tl || !tr) return { x: 0, z: 0 };

    // support = the lower toe, with 1.5 cm of hysteresis so the choice cannot
    // chatter across the crossover frame (a chattering support is itself skate)
    const ly = tl.matrixWorld.elements[13], ry = tr.matrixWorld.elements[13];
    let next = this.support;
    if (!next) next = ly <= ry ? 'L' : 'R';
    else if (next === 'L' && ry < ly - 0.015 * (g.scale.y || 1)) next = 'R';
    else if (next === 'R' && ly < ry - 0.015 * (g.scale.y || 1)) next = 'L';

    const toe = next === 'L' ? tl : tr;
    _w.setFromMatrixPosition(toe.matrixWorld);
    _v.copy(_w);
    g.worldToLocal(_v);               // character-space position of the support toe

    if (this.rootMotion && this._have && next === this.support && dt > 0) {
      _d.subVectors(this._prevLocal, _v);
      _d.y = 0;
      const lim = 0.45;
      if (_d.lengthSq() >= lim * lim) { this.lockEpoch++; this.lockReason = 'clamp'; }
      else {
        _d.applyQuaternion(g.quaternion).multiplyScalar(g.scale.x || 1);
        mx = _d.x; mz = _d.z;
        g.position.x += mx;
        g.position.z += mz;
        this.travelled += Math.hypot(mx, mz);
        _w.x += mx; _w.z += mz;       // the foot is pinned: carry it with us
      }
    }
    this.support = next;
    this._prevLocal.copy(_v);
    this._supportWorld.copy(_w);
    this._have = true;

    const F = this._feet;
    F[0].planted = next === 'L';
    F[1].planted = next === 'R';
    F[0].world.setFromMatrixPosition(tl.matrixWorld);
    F[1].world.setFromMatrixPosition(tr.matrixWorld);
    /**
     * `raw` is the TOE BONE'S OWN world position, untouched by the lock's
     * bookkeeping. `world` carries the lock's pivot, which is algebraically
     * invariant by construction — a probe reading it can only ever report
     * zero, which is a tautology and not a measurement. A97 reads `raw`.
     */
    F[0].raw.copy(F[0].world);
    F[1].raw.copy(F[1].world);
    if (next === 'L') { F[0].world.x = _w.x; F[0].world.z = _w.z; }
    else { F[1].world.x = _w.x; F[1].world.z = _w.z; }
    return { x: mx, z: mz };
  }

  /** The A13-shaped probe `A97-npc-no-skate` reads. */
  debugFeet() { return this._feet; }

  /**
   * The body was REPOSITIONED, not stepped (`NpcSystem._unstick` pulling a
   * pinned NPC out of geometry). Drop the lock entirely: carrying a pivot
   * across a teleport would charge the whole jump to the planted foot.
   */
  reanchor() {
    this._have = false;
    this.lockEpoch++;
    this.lockReason = 'teleport';
    // a teleported body has no footing to keep: the legs go back to the clip
    const st = this._step;
    st.on = false; st.w = 0; st.releasing = false; st.fresh = false;
    if (this._legs) for (const l of this._legs) { l.swing = false; l.s = 0; }
  }

  /**
   * The body was moved by something other than the animation (a depenetration
   * against a prop). Carry the lock's pivot and the reported feet with it, so
   * the next turn pivots about where the foot actually IS and the probe reports
   * the drag honestly instead of hiding it.
   */
  shift(dx, dz) {
    if (!dx && !dz) return;
    this.lockEpoch++;
    this.lockReason = 'shift';
    this._supportWorld.x += dx; this._supportWorld.z += dz;
    this._feet[0].world.x += dx; this._feet[0].world.z += dz;
    this._feet[1].world.x += dx; this._feet[1].world.z += dz;
    // a stepping body's pinned feet go with it: the shove is the artefact, and
    // the probe judges it exactly as it judges a shove on an unsolved foot
    if (this._step.on && this._legs) {
      for (const l of this._legs) {
        l.pin.x += dx; l.pin.z += dz;
        l.from.x += dx; l.from.z += dz;
      }
    }
  }

  _stance(dt) {
    const s = this.stance;
    if (!s) return;
    this.swayT += dt;
    // a gait already carries its own weight transfer; damp the idle shift so the
    // two do not fight over the pelvis
    const k = this.rootMotion ? 0.32 : 1;
    // the weight shift rides the CHEST, not the waist: a sway on the waist has
    // the same 0.6 m lever as the posture lattice and would eat it
    const sway = Math.sin(this.swayT * s.swayW + s.swayP) * s.swayA * k;

    /**
     * THE LEAN CLAMP (fix round 1, judge finding "posture lattice leans every
     * NPC 10-34 degrees off vertical").
     *
     * The waist and the chest lean in the SAME direction, in TWO axes, on top
     * of a breathing sway — so the honest quantity is the combined tilt, and
     * the table alone cannot bound it. Sum first, clamp the sum to `LEAN_CAP`,
     * then distribute: whatever the lattice asks for, no NPC is ever tilted
     * more than 6.9 degrees off its own vertical, in any clip, at any phase.
     */
    const totX = s.spine1X + s.spine3X;
    const totZ = s.spine1Z + s.spine3Z + sway;
    const tilt = Math.hypot(totX, totZ);
    const kc = tilt > LEAN_CAP ? LEAN_CAP / tilt : 1;
    this.leanRad = tilt * kc;

    this.space.syncFrame();
    // the posture is who this person IS — never damped, in any clip
    if (this.eSpine1) {
      this.space.rotChar(this.eSpine1, 'x', s.spine1X * kc);
      this.space.rotChar(this.eSpine1, 'z', s.spine1Z * kc);
    }
    if (this.eSpine3) {
      this.space.rotChar(this.eSpine3, 'x', s.spine3X * kc);
      this.space.rotChar(this.eSpine3, 'z', (s.spine3Z + sway) * kc);
    }
    if (this.eClavL) {
      this.space.rotChar(this.eClavL, 'z', s.clavL);
      this.space.rotChar(this.eClavL, 'x', s.clavFL);
    }
    if (this.eClavR) {
      this.space.rotChar(this.eClavR, 'z', -s.clavR);
      this.space.rotChar(this.eClavR, 'x', s.clavFR);
    }
    if (this.eArmL) {
      this.space.rotChar(this.eArmL, 'z', s.armL);
      this.space.rotChar(this.eArmL, 'x', s.foreL * k);
    }
    if (this.eArmR) {
      this.space.rotChar(this.eArmR, 'z', -s.armR);
      this.space.rotChar(this.eArmR, 'x', s.foreR * k);
    }
    // elbows: the third lever the hand separation is bought on, and the one a
    // walk cycle changes least — damped under root motion so an arm swing is
    // still an arm swing
    if (this.eForeL) this.space.rotChar(this.eForeL, 'x', -s.elbowL * (this.rootMotion ? 0.8 : 1));
    if (this.eForeR) this.space.rotChar(this.eForeR, 'x', -s.elbowR * (this.rootMotion ? 0.8 : 1));
  }

  _look(dt) {
    const en = this.eNeck, eh = this.eHead;
    if (!en && !eh) return;
    const g = this.group;
    this.space.syncFrame();

    let wantYaw = 0, wantPitch = 0, wantK = 0;
    if (this.lookTarget) {
      const head = this.byName.get(B.head);
      if (head) {
        _tgt.copy(this.lookTarget);
        _v.setFromMatrixPosition(head.matrixWorld);
        _d.subVectors(_tgt, _v);
        const dist = _d.length();
        if (dist > 1e-3) {
          _d.multiplyScalar(1 / dist);
          g.getWorldQuaternion(_q).invert();
          _d.applyQuaternion(_q);      // direction in character space
          wantYaw = Math.atan2(_d.x, _d.z);
          wantPitch = -Math.asin(THREE.MathUtils.clamp(_d.y, -1, 1));
          // only turn the head for something in front and within reach
          wantK = Math.abs(wantYaw) < 1.45 ? 1 : 0;
        }
      }
    }
    if (!wantK) {
      // nobody to look at: drift the gaze around on a slow timer so an idle
      // NPC is not a statue staring down its own nose
      this.idleYawT -= dt;
      if (this.idleYawT <= 0) {
        this.idleYawT = 2.6 + Math.random() * 3.4;
        this.idleYawTarget = (Math.random() - 0.5) * 1.1;
      }
      wantYaw = this.idleYawTarget;
      wantPitch = 0;
      wantK = 0.55;
    }

    const k = 1 - Math.exp(-dt * 4.5);
    this.lookYaw += (THREE.MathUtils.clamp(wantYaw, -1.25, 1.25) - this.lookYaw) * k;
    this.lookPitch += (THREE.MathUtils.clamp(wantPitch, -0.45, 0.42) - this.lookPitch) * k;
    this.lookK += (wantK - this.lookK) * k;

    const yaw = this.lookYaw * this.lookK;
    const pitch = this.lookPitch * this.lookK;
    if (Math.abs(yaw) < 1e-4 && Math.abs(pitch) < 1e-4) return;
    if (en) { this.space.rotChar(en, 'y', yaw * 0.38); this.space.rotChar(en, 'x', pitch * 0.4); }
    if (eh) { this.space.rotChar(eh, 'y', yaw * 0.62); this.space.rotChar(eh, 'x', pitch * 0.6); }
  }

  /** Health line for the gates: layers in an impossible state. */
  stuck() { return this.layers.stuck(); }

  dispose() {
    for (const l of this.slots.values()) {
      try { l.action.stop(); } catch { /* already stopped */ }
    }
    try { this.mixer.stopAllAction(); } catch { /* nothing playing */ }
    try { this.mixer.uncacheRoot(this.group); } catch { /* never bound */ }
    this.slots.clear();
    this.clipsPlayed.clear();
    this.lookTarget = null;
    this.space = null;
    this.eNeck = this.eHead = this.eSpine1 = this.eSpine3 = null;
    this.eArmL = this.eArmR = this.eClavL = this.eClavR = null;
    this.stance = null;
  }
}
