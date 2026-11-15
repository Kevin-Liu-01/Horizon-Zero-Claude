/**
 * PLAYER ANIMATOR — shared module state (M1.3a split of `src/entities/playerAnimator.js`).
 *
 * Every module-level constant, tuning table, small helper and scratch object of the animator, moved here
 * verbatim and exported, so the animator and the modules its members were moved into (`reactions.js`,
 * `locomotionDriver.js`, `aimRig.js`, `carryStow.js`, `meleeDriver.js`, `secondaryMotion.js`) share the
 * SAME objects. Scratch objects are shared on purpose: a member that reads a scratch another member wrote
 * reads it as it did when they were one file.
 */
import * as THREE from 'three';

export const X_AXIS = new THREE.Vector3(1, 0, 0);
export const Y_AXIS = new THREE.Vector3(0, 1, 0);
export const Z_AXIS = new THREE.Vector3(0, 0, 1);
export const Q_IDENT = new THREE.Quaternion();

export const _q1 = new THREE.Quaternion();
export const _q2 = new THREE.Quaternion();
export const _q3 = new THREE.Quaternion();
export const _q4 = new THREE.Quaternion();
export const _v1 = new THREE.Vector3();
export const _v2 = new THREE.Vector3();
export const _v3 = new THREE.Vector3();
export const _v4 = new THREE.Vector3();
export const _v5 = new THREE.Vector3();
export const _v6 = new THREE.Vector3();
export const _v7 = new THREE.Vector3();
export const _v8 = new THREE.Vector3();   // foot lock: ball world read-back (pass 2)
export const _reAx = new THREE.Vector3(); // elbow roll: shoulder -> wrist axis (char)
export const _rxV = new THREE.Vector3();  // the roll's hand-over: this step's pelvis (char), `_rollExit`
// hero-body targeted fix round 2 (`armFlow.camAim`): the camera this step (world), its ray in character space, its frame
export const _caP = new THREE.Vector3(), _caD = new THREE.Vector3(), _caC = new THREE.Vector3(), _caL = new THREE.Vector3();
export const _caQ = new THREE.Quaternion();
export const _caG = new THREE.Vector3();   // last step's grip carried with her step and her turn (`armFlow.camAim`)
export const _caB = new THREE.Vector3();   // ...and the bow's node, carried the same way (round 3)
export const _caX = new THREE.Vector3(1, 0, 0);
export const _a16U = new THREE.Vector3();  // the A16 elbow cap's up: the aim frame's (R52)
export const _gvW = new THREE.Vector3(), _gvT = new THREE.Vector3(); // the body-step governor (`_rollExit`): world pelvis, governed
export const _gvC = new THREE.Vector3(), _gvH = new THREE.Vector3(), _gvS = new THREE.Vector3(), _gvP3 = [null, null, null];   // ...the trunk's (round 3)
export const _gvQw = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];   // ...last step's trunk turned by her turn since
export const _trR = new THREE.Vector3();   // hero-body targeted fix round 3: `trunkReach` scratch
export const _nlC = new THREE.Vector3(), _nlD = new THREE.Vector3(), _nlA = new THREE.Vector3();   // ...and `crouchAim.nearLead`'s ray
export const _reU = new THREE.Vector3();  // elbow roll: elbow offset, perpendicular
export const _reV = new THREE.Vector3();  // elbow roll: axis x U, completes the frame
export const _reW = new THREE.Vector3();  // elbow roll: the measured height axis (char Y, or the aim frame's up)
export const _dA = new THREE.Vector3();   // aim direction (char space)
export const _anch = new THREE.Vector3(); // draw anchor (cheek)
export const _hdDown = new THREE.Vector3(); // head-frame "down" (jaw slide axis)
export const _nockOff = new THREE.Vector3(); // bow hand -> string nock (char space)
// _ikArm's PRIVATE scratch. It used to borrow _v1.._v6, which silently
// destroyed values the aim layer held across the call (the Round 4 regression
// that threw the string hand a metre out in front of her face). Nothing
// outside _ikArm may read these.
export const _ik1 = new THREE.Vector3();
export const _ik2 = new THREE.Vector3();
export const _ik3 = new THREE.Vector3();
export const _ik4 = new THREE.Vector3();
export const _ik5 = new THREE.Vector3();
export const _ikQ = new THREE.Quaternion();
export const _ikQ2 = new THREE.Quaternion();
export const _ikQ3 = new THREE.Quaternion();
export const _sh = new THREE.Vector3();   // live shoulder position
export const _el = new THREE.Vector3();   // live elbow position
export const _wr = new THREE.Vector3();   // live wrist position
// run-bob compression (R5, A-run-arms): hip / knee / ankle and the ankle goal
export const _rbH = new THREE.Vector3(), _rbK = new THREE.Vector3(), _rbA = new THREE.Vector3();
export const _rbT = [new THREE.Vector3(), new THREE.Vector3()];
export const _rbQ = new THREE.Quaternion(), _rbQ2 = new THREE.Quaternion();
export const _grip = new THREE.Vector3(); // bow grip / nock scratch
export const _pole = new THREE.Vector3(); // IK elbow pole
export const _hand = new THREE.Vector3(); // achieved IK hand position
export const _look = new THREE.Vector3(); // look-at target direction
export const _nrm = new THREE.Vector3();  // terrain normal
export const _lkH = new THREE.Vector3();  // foot lock: hip joint (char)
export const _lkK = new THREE.Vector3();  // foot lock: knee joint (char)
export const _lkA = new THREE.Vector3();  // foot lock: ankle (char)
export const _lkT = new THREE.Vector3();  // foot lock: ankle target (char)
export const _lkD = new THREE.Vector3();  // foot lock: correction (char)
export const _lkAx = new THREE.Vector3(); // foot lock: knee bend axis (char)
export const _lkQ0 = new THREE.Quaternion();
export const _lkQ1 = new THREE.Quaternion();
export const _hd = new THREE.Vector3();   // head-ellipsoid centre (char space)
export const _hdQ = new THREE.Quaternion();  // head live-vs-bind delta (char space)
export const _hdQi = new THREE.Quaternion(); // ...and its inverse
export const _hp1 = new THREE.Vector3();  // head-guard working vectors
export const _hp2 = new THREE.Vector3();
export const _sg0 = new THREE.Vector3();  // arm segment endpoints for the skull guard
export const _sg1 = new THREE.Vector3();
export const _sg2 = new THREE.Vector3();
export const _sg3 = new THREE.Vector3();  // R5 fix round 4: the swing foot's lateral axis
export const _sgD = new THREE.Vector3();
export const _ftQ = new THREE.Quaternion();  // R5 fix round 5: a foot's live char orientation (heading by its lateral axis)
export const _tq = new THREE.Quaternion();   // R5 fix round 5: the down aim's turn (form arrow -> ray)
export const _tq2 = new THREE.Quaternion();
export const _dT = new THREE.Vector3();    // R5 fix round 5: the T turn's ray (char space, from a fixed point on her)
export const _ik5W = new THREE.Vector3();  // R5 fix round 5: the climb's wrist target, world (diagnostics)
export const _ftL = new THREE.Vector3();     // ...and its live lateral axis
// _groundConform's PRIVATE roll scratch (never borrow _q1/_v6 here: _rot and
// _rotL both clobber _q1 mid-call, which silently zeroed the bank)
export const _cfQ = new THREE.Quaternion();
export const _cfQ2 = new THREE.Quaternion();
export const _cfV = new THREE.Vector3();   // terrain normal, character space
export const _cfV2 = new THREE.Vector3();  // live sole normal, character space
export const _m4 = new THREE.Matrix4();
export const _m3 = new THREE.Matrix3();
// _springs' PRIVATE scratch. The Verlet solver runs after every other overlay
// and must not borrow a vector the aim layer or the foot lock still holds.
export const _spA = new THREE.Vector3();
export const _spB = new THREE.Vector3();
export const _spC = new THREE.Vector3();
export const _spD = new THREE.Vector3();
export const _spQ = new THREE.Quaternion();
export const _spQ2 = new THREE.Quaternion();
export const _spQ3 = new THREE.Quaternion();
export const _spE = new THREE.Vector3();
export const _spAcc = new THREE.Quaternion();
// _pushOutOfCapsule's OWN scratch — the caller hands it `_spC` as the point to
// move, so it may not borrow any `_sp*` vector (see the note on the method).
export const _cp0 = new THREE.Vector3();
/** `_segDistN`'s result: a number `_springs` reads without a boxed return. */
export const _spNum = new Float64Array(1);
/** M1.2e fix 1: the sash panels' sheet test (`_sheetPush`): the sheet's normal and lateral axis, the cross-section
 *  sample and the link's world rotation. */
export const _shN = new THREE.Vector3();
export const _shL = new THREE.Vector3();
export const _shP = new THREE.Vector3();
export const _shX = new THREE.Vector3();
export const _shQ = new THREE.Quaternion();
export const _shQ2 = new THREE.Quaternion();
/** `_springParentQ`'s rotation matrix. */
export const _spMq = new THREE.Matrix4();
export const _cp1 = new THREE.Vector3();
export const _cp2 = new THREE.Vector3();
// W0b targeted fix 2: the M10 fallback's candidates (`_springs`) and the draw
// arm's root keep-out (`_clearArmOfRoots`) — private, never borrowed
export const _hcU = new THREE.Vector3();
export const _hcC = new THREE.Vector3();
export const _hcB = new THREE.Vector3();
export const _crR = new THREE.Vector3();   // a chain root, char
export const _crS = new THREE.Vector3();   // the draw shoulder joint
export const _crE = new THREE.Vector3();   // the capsule's three points: elbow, wrist, fingertip
export const _crW = new THREE.Vector3();
export const _crF = new THREE.Vector3();
export const _crP = new THREE.Vector3();   // the capsule point nearest the root
export const _crN = new THREE.Vector3();
export const _crQ = new THREE.Quaternion();
// twist-joint scratch
export const _twQ = new THREE.Quaternion();
// alidade overlay (E5) scratch: never reallocated
export const _alM = new THREE.Matrix4();
export const _alM2 = new THREE.Matrix4();
export const _alQ = new THREE.Quaternion();
export const _alQ2 = new THREE.Quaternion();
export const _alV = new THREE.Vector3();
export const _alV2 = new THREE.Vector3();
export const _alS = new THREE.Vector3();
export const _alEye = new THREE.Vector3();
export const _alFwd = new THREE.Vector3();
export const _alX = new THREE.Vector3(1, 0, 0);
export const _twA = new THREE.Vector3();
export const _tp0 = new THREE.Vector3();   // trunk posture: pelvis, then neck (char)
export const _tp1 = new THREE.Vector3();
export const _anW = new THREE.Vector3();   // R5: the WRIST's anchor (the nock's anchor, less the hand), char
export const _rOut = new THREE.Vector3();  // R5: her right of the arrow (the back of the draw hand), char
export const _dBN = new THREE.Vector3();   // R5 fix round 4: the wrist's "behind the nock" direction, char
export const _knK = new THREE.Vector3(), _knW = new THREE.Vector3(), _knA = new THREE.Vector3(), _knB = new THREE.Vector3();   // R5 fix round 4: knuckle-on-string
export const _knQ = new THREE.Quaternion();
export const _knN = new THREE.Vector3();   // R5 fix round 4: the bow's rendered nock, char
export const _efC = new THREE.Vector3();   // R5 fix round 3: the draw elbow's circle centre (form scan), char
export const _efF = new THREE.Vector3();   // ...the head's live forward
export const _efUp = new THREE.Vector3();  // ...the aim frame's up
export const _efE = new THREE.Vector3();   // ...a candidate elbow
export const _efW = new THREE.Vector3();   // ...its forearm's direction (hero-body targeted fix round 3, `elbowForm.fore`)
// W0b targeted fix 3: the draw arm's continuity (`tune.armFlow`) — private, never borrowed
export const _afD = new THREE.Vector3();   // the wrist target's step
export const _afS = new THREE.Vector3();   // the draw shoulder joint, char
export const _afE = new THREE.Vector3();   // the elbow, char
export const _afW = new THREE.Vector3();   // the wrist, char
export const _afA = new THREE.Vector3();   // the shoulder -> wrist axis
export const _afC = new THREE.Vector3();   // the elbow circle's centre
export const _afU = new THREE.Vector3();   // the circle's basis (U: the solved elbow)
export const _afV = new THREE.Vector3();
export const _afP = new THREE.Vector3();   // a candidate elbow / scratch
export const _afF = new THREE.Vector3();   // the head's live forward
export const _afQ = new THREE.Quaternion();
export const _afQ2 = new THREE.Quaternion();
export const _afG = new THREE.Vector3();   // the arm step's scratch (`_armRate`)
export const _afH = new THREE.Vector3();
export const _afT = new THREE.Vector3();   // ...the fingertip off the wrist
export const _afJ = new THREE.Vector3();   // ...a candidate elbow, wrist, fingertip
export const _afK = new THREE.Vector3();
export const _afL = new THREE.Vector3();
export const _knM = new THREE.Matrix4(), _knZ = new THREE.Vector3(), _knQ2 = new THREE.Quaternion();   // W0b targeted fix 4: the bow as combat aims it
export const _hcD1 = new THREE.Vector3(), _hcD2 = new THREE.Vector3(), _hcD3 = new THREE.Vector3();   // W0b targeted fix 4: `_hcSegMin`
export const _hcP = new THREE.Vector3(), _hcQ = new THREE.Vector3(), _hcP2 = new THREE.Vector3(), _hcQ2 = new THREE.Vector3();
export const _afQu0 = new THREE.Quaternion(), _afQl0 = new THREE.Quaternion();   // W0b targeted fix 4: `_armRate`: the solve's upper arm and forearm
export const _afJ2 = new THREE.Vector3();  // W0b targeted fix 4: `_armRatePose`'s root test (elbow, wrist, fingertip)
export const _afK2 = new THREE.Vector3();
export const _afL2 = new THREE.Vector3();
export const _afM = new THREE.Vector3();   // ...`_behindSkullPt`'s scratch
export const _afM2 = new THREE.Vector3();
/** W0b targeted fix 3: an angle wrapped to [-pi, pi]. */
export const afWrap = (a) => (a > Math.PI ? a - 2 * Math.PI : (a < -Math.PI ? a + 2 * Math.PI : a));


// (ball- and ankle-bone rest heights are MEASURED off the bind pose in the
// constructor — assets.js grounds Brea with a -55mm yOffset so the skirt
// tassels do not float her, which leaves ball_l at y = -0.007, not at 0)
// max horizontal correction the foot lock will hold before it re-anchors (m)
export const MAX_LOCK = 0.3;

/* -------------------------- the melee step-in ----------------------------- */
/**
 * THE STEP-IN NEEDS A LEG (lane `player-melee`, fix round 2).
 *
 * `melee.js::_stepIn` pushes a forward velocity impulse into the controller so
 * the weight arrives with the blade — §4's A102 asks for 0.25-0.8 m of root
 * travel per swing. Until this block existed nothing moved a FOOT: the melee
 * clip is upper-body-masked by design (A105 keeps the stride), so at a
 * standstill the root translated out from under two locked feet and the lock
 * saturated at `MAX_LOCK` and slid. Measured by the judge: 0.404 m of planted
 * ball travel on a standing heavy, with the ball never leaving the ground.
 *
 * So a standing character now TAKES the step. While the window below is armed
 * (only ever by `beginMeleeStep`, so nothing outside melee changes behaviour),
 * each ball's char-space XZ is compared with the stance she was standing in;
 * when one has been dragged more than `STEP_TRIGGER` out of place, that foot
 * is flagged UNPLANTED — which releases its lock and is what `debugFeet`
 * reports — lifted along an arc and replanted at the place her body now needs
 * it, leading the body by its own velocity so the step lands ahead rather than
 * chasing. One foot at a time: she is never off the ground.
 */
export const STEP_TRIGGER = 0.105;  // char-space error that earns a corrective step (m)
/* ...and while a NEW melee stance key is being settled into (round 5 fix pass
 * 1, lane player-melee — `meleeLayer._stance` swaps a stance key under a loaded
 * stance and calls `beginMeleeStep(true)`): the home is re-captured off the new
 * key and a foot re-places once it is this far out of it. The deep heavy is
 * sensitive to it — its knees are folded near their limit, so feet left 8 cm
 * further apart by the previous beat held the pinned heavy's hips 0.11 m up
 * (0.799 against 0.686 m, 2 of 20 A102 runs) with every foot inside the
 * 0.105 m trigger. Only the melee key swap arms it; nothing else changes. */
export const STEP_TRIGGER_REKEY = 0.03;
export const STEP_DUR = 0.155;      // flight time (s)
export const STEP_LIFT = 0.075;     // peak ball lift over the arc (m)
export const STEP_LEAD = 0.22;      // seconds of her own velocity the step leads by
export const STEP_LEAD_MAX = 0.34;  // ...and the most it may lead (m)
export const STEP_WINDOW = 1.15;    // how long a step-in keeps the system armed (s)
export const STEP_COOL = 0.06;      // a landed foot stays down at least this long (s)
/* World travel of a PLANTED ball that forces a step regardless of every other
 * rule (see _tryStep). This is the quantity A13/A31/A105 measure, so it is a
 * bound on the gate's own reading and not a proxy for one; 0.040 m sits at half
 * of A105's 0.08 m bar, which leaves the frame that detects it room to settle. */
export const STEP_SLIP = 0.040;     // measured ball skate that forces a step (m)
/* R5 (hero-body, A31g) — THE LOCOMOTION STEP. On an aim-strafe reversal the
 * mirrored strafe clip keeps the old stance foot down for up to half a second
 * while the body has already turned round: the lock ran to its 0.30 m cap and
 * its anchor slid 0.1-0.26 m on the ground (Round 4 left 0.05-0.45 m
 * ungated). A planted foot whose lock has spent this much of its budget, or
 * whose ball has really moved this far, is picked up and re-placed under the
 * clip's own foot on the step arc — a quick re-step, never a slide. */
export const LOCO_STEP_ERR = 0.24;  // lock correction that earns a re-step while moving (m)
export const LOCO_STEP_SLIP = 0.03; // real ball travel that earns one at once (m)
// nock-reach flourish window (s). Older game's reach-to-quiver beat is ~0.25-0.35s;
// at the Round-4 value of 0.13s it was 8 frames and never read on film.
// FIX ROUND (player-anim): 0.34, not 0.28. Older game's reach-to-quiver beat is
// 0.25-0.35 s and the hand has to physically GET to the hip and back inside
// it — at 0.28 s the dip bottomed out at 0.154 m from the quiver point instead
// of the 0.05 m it reaches at 0.34, and on a loaded box (16 lanes on one GPU,
// ~20 fps) the whole beat was six frames, which is why gate A17-draw-beats'
// `frames >= 8` clause failed on a flourish that was working correctly.
export const QUIVER_T = 0.34;
// hip quiver attach point in character space — where the string hand dips
export const QUIVER_HIP = new THREE.Vector3(-0.2, 1.02, -0.14);
// Cheek/mouth-corner draw anchor in the HEAD BIND frame (m). x is her RIGHT
// cheek, y level with the head bone (which sits at the base of the skull), z
// forward toward the corner of the mouth.
//
// FIX ROUND 2: x was -0.115, i.e. 3cm PROUD of a skull whose half-width is
// ~0.085 — the hand floated off the face — and z 0.105 with y +0.005 put it
// beside the ear rather than on the jaw line, which is where the hair mass is.
// On the cheek surface at mouth height the hand is both readable on film and
// 3cm closer to the bow shoulder, which is 3cm of draw length bought back.
export const ANCHOR_OFF = new THREE.Vector3(-0.086, -0.024, 0.118);
// How far the anchor may slide DOWN the jaw when the bow arm cannot otherwise
// reach a full draw. An under-chin anchor is real archery form (Olympic
// recurve uses it), and it costs far less than the alternative the old code
// took — sliding the whole draw line backwards, which buried the hand behind
// her ear inside the hair.
// FIX ROUND (player-anim): 0.038, down from 0.06. The drop is measured from a
// cheek anchor that already sits 0.148 m from the head BONE (which is at the
// base of the skull), so every centimetre of it is a centimetre of
// |hand_r - head|: at the full 0.06 the hand measured 0.178 m from the head
// aiming up, outside the 0.10-0.16 m band gate A35-cheek-anchor holds it to,
// and on film the glove had left her cheekbone for her jaw. The bow-arm
// lock-out (BOW_ARM_LOCK) bought back 5 mm of the reach this was paying for,
// and whatever deficit is left now goes to the ray slide.
export const ANCHOR_DROP = 0.038;
// How far the string hand may sit from the anchor at full draw (m): the wrist
// is behind the fingers that hook the string, and that is all. Without this
// clamp the hand rides the NOCK, and the nock carries the reach clamp's whole
// residual — measured 0.155 m from the anchor at a steep up-aim, i.e. not on
// her face at all. Only engaged past `HAND_ANCHOR_FROM` of draw, so the ramp
// (gate A32-draw-ramp's domain) keeps riding the string exactly as before.
export const HAND_ANCHOR_R = 0.064;
export const HAND_ANCHOR_FROM = 0.72;
// Head keep-out ELLIPSOID in the head bind frame: centre + semi-axes, measured
// off the render (head bone y 1.40, chin 1.32, crown 1.56, half-width ~0.085).
// A sphere here is wrong in both directions — big enough to keep the forearm
// off the face it also swallows the cheek anchor, and small enough to allow
// the anchor it lets the hand sink into the jaw.
export const HEAD_OFF = new THREE.Vector3(0, 0.05, 0.01);
export const HEAD_R = new THREE.Vector3(0.105, 0.135, 0.115);
// How deep the DRAWING HAND may sit inside that ellipsoid, as a fraction of
// its radius. The anchor touches her face, so 1.0 (fully outside) is wrong;
// 0.90 keeps the glove and the bracer plate on the surface of the cheek
// instead of inside the skull, where the braid rendered straight through them.
export const HAND_IN = 0.90;
// Fraction of the bow arm's full span the grip is allowed to use at full
// draw. cos(elbow) = (L1^2+L2^2-d^2)/(2 L1 L2), so 0.9945 of span is a ~168
// deg elbow — the locked brace of reference/draw-side.jpg — where the old
// 0.985 read as a soft 156 deg arm. Gate A35-cheek-anchor asserts 165-172.
export const BOW_ARM_LOCK = 0.9945;

/* The three hot-path helpers, written small on purpose (R48 c, melee W1). THREE's
 * own go through Math.max/min and lerp, and the optimiser's cumulative inlining
 * budget runs out long before the end of `update`: a double returned across a call
 * that is not inlined is a fresh HeapNumber. These are small enough to be inlined
 * whatever the budget, and read the same values. */
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const damp = (x, y, l, dt) => { const t = 1 - Math.exp(-l * dt); return (1 - t) * x + t * y; };
export const smoothstep = (x, a, b) => { if (x <= a) return 0; if (x >= b) return 1; const u = (x - a) / (b - a); return u * u * (3 - 2 * u); };

export const KEY = {
  pelvis: 'pelvis_05',
  spine1: 'spine_01_06', spine2: 'spine_02_07', spine3: 'spine_03_08',
  spine4: 'spine_04_09', spine5: 'spine_05_010',
  neck1: 'neck_01_0102', neck2: 'neck_02_0103', head: 'head_0104',
  clavL: 'clavicle_l_011', clavR: 'clavicle_r_042',
  upArmL: 'upperarm_l_012', upArmR: 'upperarm_r_043',
  loArmL: 'lowerarm_l_013', loArmR: 'lowerarm_r_044',
  handL: 'hand_l_014', handR: 'hand_r_045',
  thighL: 'thigh_l_0185', thighR: 'thigh_r_0211',
  calfL: 'calf_l_0186', calfR: 'calf_r_0212',
  footL: 'foot_l_0189', footR: 'foot_r_0215',
  ballL: 'ball_l_0190', ballR: 'ball_r_0216',
  // face: eyes + lids drive the look-at's last 10 % and the blink timer
  // (player-anim-13). The rig carries them under `faceAttach_0105`.
  eyeL: 'L_eye_0127', eyeR: 'R_eye_0124',
  lidUL: 'L_eye_lid_upper_mid_0128', lidLL: 'L_eye_lid_lower_mid_0129',
  lidUR: 'R_eye_lid_upper_mid_0125', lidLR: 'R_eye_lid_lower_mid_0126',
};

/**
 * Damage classes (player-anim-09). `w` is the clip weight the react takes off
 * the locomotion tree, `lean` the peak of the procedural torso lean in radians
 * (gate A36-hit-react-visible reads the pelvis -> spine_03 angle, so the
 * pelvis, spine_01 and spine_02 shares below all count toward it), and `dur`
 * the length of the whole beat. A 14 hp hit is a `stagger`.
 */
export const HIT_CLASSES = {
  light: { w: 0.55, lean: 0.17, dur: 0.62, slot: 'hitChest', shake: 0.18 },
  stagger: { w: 0.85, lean: 0.30, dur: 1.18, slot: 'hitChest', shake: 0.42 },
  knockdown: { w: 1.00, lean: 0.44, dur: 1.55, slot: 'hitHead', shake: 0.75 },
};
/** hp thresholds, as a fraction of max health, between the three classes. */
export const HIT_STAGGER_FRAC = 0.10;
export const HIT_KNOCKDOWN_FRAC = 0.26;

export const FINGER_SEGS = ['01', '02', '03'];
export const FINGERS = ['index', 'middle', 'ring', 'pinky'];

/**
 * dyn_ secondary-motion classes. Every dyn_ chain in the rig is DISCOVERED by
 * walking the skeleton (see _buildChains) — the Round-4 hand-written list named
 * eight of them and left the quiver, pouches, necklace, leg dangles, front
 * locks, sashes, ropes and skirt splits rigidly welded to the body.
 *
 * The physics is a base-driven pendulum, which is what these chains are:
 *   ang'' = -k*ang - c*ang' + (aBase / L) + drive
 * `k` sets the natural frequency (sqrt(k) rad/s; a 0.35 m ponytail is ~5 rad/s)
 * and `zeta` the damping ratio. The forcing that matters at speed is NOT the
 * character's velocity — that is a DC term and parks the chain at a fixed lean,
 * which is exactly how Round 4 froze every strand — it is the base ACCELERATION:
 * the pelvis bobs ~6cm twice per gait cycle, and at a 3.2 Hz sprint step rate
 * that is ~25 m/s^2 at the attachment point. Plus a per-foot-plant impulse (the
 * kick that makes hair and skirt flick once per step) and a whip proportional
 * to the character's own jerk (hard stops, turns, landings).
 */
/**
 * `stiff` is the squared natural frequency w^2 of the segment (a 0.30 m
 * ponytail pendulum is w = sqrt(g/L) = 5.7 rad/s, so w^2 ~ 32; short stiff
 * cloth is an order of magnitude above that) and `drag` is 2*zeta*w. `grav` is
 * how much of real gravity is added ON TOP of the artist's bind droop — full g
 * would sag the authored silhouette by g/w^2 (0.20 m on hair), so this is a
 * fraction. `base` scales the non-inertial term (see _springs).
 */
/*
 * FIX ROUND (player-anim, Round 4): the first drop of this table drove every
 * chain STRAIGHT INTO ITS BEND LIMIT and left it there. Measured at 8.2 m/s
 * sprint: the ponytail's seven segments sat at 63-96 deg of accumulated bend
 * (the per-segment clamp, permanently saturated), the tip hung 0.55 m off its
 * animated rest, and — because a saturated clamp is a CONSTANT rotation — the
 * local quaternion of `dyn_hairBackMain_03` moved 1.28 deg over 1.6 s. A rigid
 * rod at a fixed angle is exactly what `player-anim-05` reported, and the old
 * numbers reproduced it from the other side: too MUCH force reads identically
 * to none. Three causes, all fixed:
 *   1. `base` ~1.0 against `stiff` ~46 means a steady 26 m/s^2 at the
 *      attachment displaces the strand by 26/46 = 0.57 m. The static response
 *      `a*base/stiff` is now ~0.10 m for hair and less for everything shorter,
 *      which is a swing rather than a slam.
 *   2. the constraint's velocity feedback injected `0.5*|projection|/dt`,
 *      i.e. ~9 m/s when the projection was 0.3 m — the solver fed itself.
 *   3. the body capsule pushed particles whose ARTIST REST is already inside
 *      it out to the surface, welding the ponytail to a moving cylinder.
 * `stiff` is the segment's squared natural frequency w^2, `drag` is 2*zeta*w,
 * `grav` is the fraction of g added on top of the artist's bind droop, `base`
 * scales the non-inertial term and `strike` the per-foot-plant impulse.
 */
export const DYN_CLASSES = [
  // hair: long, light, whippy — the reference shots' most visible secondary
  { name: 'hair', re: /hair|frontLock/i, stiff: 150, drag: 7.4, grav: 0.22, maxAng: 0.42, strike: 1.30, base: 0.34, collide: 1 },
  { name: 'necklace', re: /necklace/i, stiff: 200, drag: 9.0, grav: 0.18, maxAng: 0.30, strike: 0.60, base: 0.28, collide: 1 },
  { name: 'dangle', re: /Dangle/i, stiff: 170, drag: 6.6, grav: 0.26, maxAng: 0.44, strike: 0.85, base: 0.32, collide: 0 },
  { name: 'cloth', re: /skirt|Flap|[Ss]ash|Rope/i, stiff: 150, drag: 6.4, grav: 0.26, maxAng: 0.38, strike: 0.95, base: 0.32, collide: 2 },
  { name: 'gear', re: /pouch|quiver|arrow/i, stiff: 220, drag: 12, grav: 0.14, maxAng: 0.24, strike: 0.55, base: 0.30, collide: 1 },
  { name: 'shirt', re: /shirt/i, stiff: 420, drag: 23, grav: 0.06, maxAng: 0.16, strike: 0.32, base: 0.18, collide: 0 },
];
export const DYN_FALLBACK = DYN_CLASSES[3];
/** R5 fix round 4: the aim side-step's swing foot (see `_strafeSwingFeet`): toe pitch cap (rad) and toe clearance (m). */
export const SWING_TOE_PITCH = 0.43, SWING_TOE_CLR = 0.015;
/** R5 fix round 5: the swing foot's heading band about the planted foot's (rad; V13's bar is ~20 deg). */
export const SWING_YAW_BAND = 0.14;
/** R5 fix round 5: the climb's catch — both SOLVED palms this close to the edge re-solve the arms at full weight that frame and latch them there (m). */
export const CLIMB_CATCH = 0.08;
/*
 * R5 fix round 4 — THE WRAP TAIL IS CLOTH IN THE WIND, NOT A PENNANT (judge r1:
 * fix round 3's `restKick` turned its rest out ~50 deg in CHARACTER space every
 * frame: a rigid violet plank that stood further out standing still than
 * running, and turned with her). Two physical terms replace it:
 *
 *  1. AIR (`wind`, 1/s): every particle of a class with `wind` > 0 is dragged
 *     toward the AIR's velocity — the world wind (`animator.wind`, default the
 *     bible's NE trade wind from bearing 045, §2.2: "flags stream SW") with
 *     slow gusts and a per-chain flutter across it — horizontally, by
 *     `wind * depth` (depth 0 at the root, 1 at the tip):
 *         a += wind * depth * (U_air - v_particle)          (x, z)
 *     So at rest in the trade wind the tail streams SW, whatever her facing,
 *     and flutters; running she meets her own speed of air and it TRAILS — more
 *     at a sprint than at a jog, more at a jog than standing in still air: the
 *     right way round. Vertical velocity is not dragged (the knot tail's bounce,
 *     A33, is a vertical oscillation).
 *  2. A WRAPPED ROOT (`rootK`): the per-particle stiffness rises toward the
 *     knot, k_j = stiff * (1 + rootK * (1 - j/N)^2), so the wrapped section
 *     leaves the knot on its authored line and the free end hangs and moves.
 *
 * `wrap` is reachable only through a rig profile's `chainClasses` (no Round-4
 * regex names it). Brea: `{ wrap: '^dyn_wrapSash' }`.
 */
/* fix round 5 (judge r2, V-brea-one-glance cue 2): the strip couples to the
 * air harder (`wind` 2.3 -> 3.0 1/s: at the trade wind's 5.5 m/s the tail
 * stands 62-71 deg off the vertical, where a cloth tail in a moderate breeze
 * flies — it hung at 41-62 and lay along the stowed bow's limb in the 64 px
 * black fill; 4.5 laid it flat and edge-on to the front lens, and 3.5 let a
 * lull bring it back to 3 px of reach in the back view, probe `tailproto` /
 * run f5lane1), and the wrapped root is stiffer (`rootK` 5 -> 8) so the
 * knotted section holds the recipe's new left-rear line (brea.mjs
 * CHAINS.wrapSash) while the free end moves. */
/* W0b targeted fix (A-tail-legible graded at EVERY gust moment, not only the
 * sheet's — the draft bar restored): with the bend limit at 0.62 rad per link
 * and the air coupling at 3.0 1/s the free strip could not swing far enough
 * off its hanging rest to follow the air, and at some gust phases it folded
 * down along the stowed bow's limb (the side lenses 0-3 px clear, reach 1-3:
 * 6-10 of 60 trade-wind moments under the bar, probes t2-t7 under taskpolicy -b;
 * re-measured under nice, probe w5/p1: 3 of 24 and w5/p2: 2 of 24; scratchpad
 * r5/hero-body/bin/probe-tail.mjs). A cloth strip has next to no bending
 * stiffness and a light strip's drag dwarfs its weight in a 5.5 m/s wind:
 * `maxAng` 0.62 -> 1.3 rad (the wrapped root still holds its line through
 * `rootK`), the air coupling `wind` 3.0 -> 5.0 1/s, the fall `grav` 0.42 ->
 * 0.30, and `airY`: the air now resists the strip's VERTICAL flap as well (the
 * Round-4 classes drag only horizontally, for the knot tail's bounce, A33; the
 * downward flutter phase, unresisted, is what folded the strip onto the bow).
 * Trade-wind moments under the bar (probes t8-t11, run under taskpolicy -b,
 * superseded by the re-measure below): 3.6 /s 7 of 60, 4.5 /s 10
 * of 120, 5.0 /s 1 of 240, 5.0 /s + airY 0 of 120 (every view >= 6 px clear,
 * reach >= 4). Softer strips (stiff 6-20 with the root stiffness confined to
 * the knot) flapped and folded down more, not less (probe t4).
 * Re-measured under `nice -n 10` (targeted fix round 1, Oct 30): 1 of 680
 * trade-wind moments under the bar (front reach 3, run w5/c1). That
 * coupling held the strip taut at a sprint (V23: one flat strip in all three
 * frames, tip 0.058 m per 80 ms), so `runFl` 1.5 scales the flutter with her
 * speed (see `_springs`): 0.08-0.095 m per 80 ms at a sprint, idle unchanged. */
/* (M1a regressions, ruling 5: in still air the stiffness held the tail on its authored rest, streaming level behind
 *  her head as if in a wind (F13, F09 at 4f03003, the studio's air held still). `stillGrav` 14: in a dead calm its fall
 *  grows to x15 (secondaryMotion `_springs`; nothing at 2 m/s and over). Bench, heading 0: the tail's chord 49 deg off
 *  the plumb in still air before, 25 after; 25-27 in the trade wind, unchanged) */
DYN_CLASSES.push({ name: 'wrap', re: /(?!)/, stiff: 42, drag: 4.2, grav: 0.30, maxAng: 1.3, strike: 0.7, base: 0.30, collide: 2, wind: 5.0, rootK: 8, airY: true, runFl: 1.5, stillGrav: 14 });
/*
 * M1.2e — THE SASH PANELS (brea.mjs CHAINS.panelL / panelR / panelB; outfit-pan-1 skins the three long hip panels to
 * them): heavy embroidered cloth hanging from the belt. Heavier and slower than the wrap tail (`grav` 0.75, `stiff`
 * 26 about the hanging rest, `drag` 4.5), coupled to the air less (`wind` 1.6 1/s: the trade wind streams them SW, by
 * about a third of the tail's angle), bend limit 0.7 rad per link. `collide: 3`: the torso keeps the rest rule (a
 * strand never pushed further out than the artist hung it), the thighs and the shins push at FULL radius, because a
 * panel's rest rides the pelvis and the legs move under it (the rest rule would let a striding thigh through it).
 */
/* (M1.2e round 2: `wind` 0.45 -> 1.2 1/s: at 0.45 the left panel's tip moved 0.009-0.06 m in the trade wind and read
 * as a board; at 1.2 it streams 0.11-0.18 m SW standing where F02 and F15 stand, bench) */
/* (M1a debt, M1.2e "stream SW in the trade wind" in the page: `flut` 3.5, the panels' own gain on the wind's flutter
 *  (secondaryMotion.js flA; the tail keeps 1). At 1 the wind pressed the left panel to her leg and it swayed LESS than
 *  in still air (page F02: 0.0456 against 0.0463 m; bench at F02's heading 0.0259 against 0.0332): no visible wind.
 *  Bench at 3.5, F02 / F15 headings: left panel 0.064 / 0.067 m in the wind against 0.051 / 0.041 still, every tip
 *  within 45 deg of SW; 0 clipping frames in every sweep clip) */
/* (M1a debt fix round 1, M1.2e at F02: `wind` 1.2 -> 2.4 1/s. F02's trade wind is 3.65 m/s in the page (F15 5.58), and
 *  at 1.2 the left panel's tip moved 0.029 m there (page, 88b1605; bar 0.05). Bench at the page's speeds and headings:
 *  F02 left panel 0.049 -> 0.137 m (bearing 232), F15 0.188 -> 0.275 m (258); 1.8 and 2.0 left F02's left panel at
 *  0.078 / 0.088 m but bearing 186 / 191, at the edge of SW's 45 deg; 0 clipping frames in every sweep clip) */
/* (M1a regressions, M1.2e: at 2.4 1/s with `flut` 3.5 and the push linear in depth a gust swung each panel up as one
 *  straight board: the front panel streamed forward as a stiff pennant in F09 and the back panel stood out level behind
 *  her in F15. `hang` 2: the air's push on a particle falls with cos^2 of the lift of the segment above it (secondaryMotion
 *  `_springs`), so a lifted panel takes less of it; `rootK` 3: the top links keep nearer the belt's hang than the lower
 *  ones (the wrap tail's stiffness profile), so the panel bends along its chain; `flut` 3.5 -> 2.5. Bench (standing,
 *  3 s at 1/60 s): at a 9 m/s gust on F09's heading the left panel's chord lifts p95 39 deg, max 41 (45 / 58 before),
 *  its top segment 20 deg and its lowest 46 (a bend, not a board); at F02 (3.65 m/s) the left panel's tip moves
 *  0.114 m SW (bar 0.05) and sways 0.072 m against 0.044 in still air. The studio frames have no wind at all (ruling 5:
 *  tools/frames/page.mjs holds environment.windAt at still air under the studio light)) */
/* (...and `wind` 2.4 -> 3.2, `flut` 2.5 -> 2.0: with `hang` and `rootK` the push left the left panel's mean move at F02 small
 *  beside the idle's weight shift (page, c49cb19 / cad69ac: bearing 226, 188, 178 against the bar's 180-270). Bench at
 *  3.2: F02's heading 219 deg, 0.13 m (232, 0.14 at 2.4), every heading within 15 deg of SW; a 9 m/s gust on F09's
 *  heading lifts the left panel's chord p95 38 deg, max 41) */
/* (M1a regfix 2, F15 / F19: `moving`, the standing tuning above eases, as her hips travel (0.5-1.5 m/s of the panel
 *  root's own speed, secondaryMotion `_springs`), to the air the panels ran on when F15 and F19 were accepted (fb6d5f0:
 *  `wind` 1.2, `flut` 1, no `hang`, no `rootK`) with `airSelf` 0.4. The page probe (tools/gates/hero-sweep/sash-probe.mjs,
 *  F15 and F19 staged by the Frame Set's own page.mjs, two each; angle of the panel's chord below horizontal): in the
 *  lunge's contact frame the front left panel read 29 / 8 deg on this tree as it stood, 16 / 8 at the anchor (24 in a
 *  third), 37 / 39 with this (it curls down, never level: 0 of its swing steps under 20 deg); in the run the back panel's
 *  median 54 / 52 deg (anchor 44 / 40, as it stood 42 / 47). With `airSelf` 1 in motion (the anchor's own) the front
 *  panel still shot out level in one lunge of two (-7 deg)) */
DYN_CLASSES.push({ name: 'panel', re: /(?!)/, stiff: 30, drag: 5.0, grav: 0.8, maxAng: 0.45, strike: 0.45, base: 0.42, collide: 3, wind: 3.2, airY: true, flut: 2.0, hang: 2, rootK: 3, airSelf: 0.4,
  /* (M1a regfix 4, F15: in motion the drag against her own travel is the anchor's again (`airSelf` 0.4 -> 1) and the
   *  panels fall a little harder (`grav` 0.8 -> 1.2). The run's front panel is a chaotic system: the thigh kicks it
   *  through each stride and the frozen frame catches wherever the kick left it. At 4175212 the sim-time F15 caught it
   *  thrown out level at hip height. Bisected on the page's own sim-time staging (sash-probe, head's page.mjs, clean
   *  worktrees): fb6d5f0 front panel 35.7 deg below horizontal, 26ec7f8 35.4 (its back panel's hem flicked up),
   *  7e3e3df 15.9 with the hem turned up 46 deg (the level strip: the wind coupling 1.2 -> 2.4 1/s). The moving tuning
   *  took wind and flutter back to the anchor's but kept `airSelf` 0.4 (de57067). Dressed bench, F15's run (sprint to
   *  the first step at gait phase 0), 90 starts over idle length, wind 5.5-6.5 m/s and three run-up ramps: front panel
   *  under 25 deg 5 of 90 at 4175212's tuning, 1 with the anchor's air, 0 with this (median 44 deg, the anchor's air
   *  39; min 36); the back panel above 35 deg below horizontal 1 of 90 (10 at 4175212). In a lance swing `swing`
   *  keeps the 0.4 and its own fall, so F19 is staged as at 4175212) */
  moving: { v0: 0.5, v1: 1.5, wind: 1.2, flut: 1, hang: 0, rootK: 0, airSelf: 1, grav: 1.2 },
  /* (M1a regfix 3, F19: in a lance swing the panels fall a little harder and bend less off their rest, so the front
   *  panel goes forward and down ahead of her front knee in the heavy's lunge, as in the anchor re-filmed at fb6d5f0
   *  (chord 15-17 deg below horizontal, the hem 25-30), and is never thrown out level. Without it the lunge's panel
   *  was chaotic: dressed bench, F19's staging, 4-31 deg over ten starts; in the page at d3dd253 17.6 then -2.7 on two
   *  stagings and a level strip in the film. With 1.0 / 0.35 rad: bench 18-39 deg over 14 starts (median 34); in the
   *  page 1.0 / 0.38 and 1.1 / 0.35 read 31 deg on every staging. At 1.4 / 0.25 (c0dab09) it hung steeper than the
   *  anchor, 45 deg past the knee to the ground) */
  swing: { grav: 1.0, maxAng: 0.35, up: 12, airSelf: 0.4 } });
/** Air coupling per Round-4 class (1/s; 0 = none). Hair a little, cloth some, gear none. */
export const DYN_WIND = { hair: 0.22, necklace: 0, dangle: 0.15, cloth: 0.55, gear: 0, shirt: 0 };
/** The default world wind (bible §2.2: the NE trade wind from bearing 045; north = -Z, east = +X). */
export const WIND_FROM = 45 * Math.PI / 180, WIND_SPEED = 5.5, WIND_GUST = 0.35, WIND_FLUTTER = 0.32;
// Verlet solver limits. `SUB_DT` bounds one integration step; `MAX_SUB` bounds
// how many of them a single `_springs` call may take.
export const SUB_DT = 1 / 45;
/*
 * MAX_SUB / the `_springs` dt clamp: 3 substeps and 0.05 s, the values this
 * loop has always effectively used.
 *
 * HISTORY (fix rounds 1-3). Fix round 1 raised them to 6 / 0.12 s, claiming the
 * old pair had been making the hair run in SLOW MOTION on frames longer than
 * 50 ms. That claim was wrong: `src/main.js` sub-steps the whole sim
 * (FIXED_DT 1/60, MAX_STEPS 3, `dt = min(FIXED_DT, simDt / steps)`), so
 * `player.update` -> `animator.update` -> `_springs` can never be handed more
 * than 1/60 s however long the frame was — measured in page context with a
 * 48 ms busy-wait on `engine.onAfterRender`: at 10.3 fps (worst real frame
 * 369 ms) and again at 1.9 / 0.7 fps, `maxSpringsDt` was 0.016666 s and the
 * solver took one substep every time. Fix round 2 documented that but LEFT the
 * raised pair in the tree, where judge-player-anim-r2 correctly called it two
 * untested solver constants that no gate exercises and that would silently
 * change behaviour for the first caller that is not sub-stepped. Fix round 3
 * restores them. What actually fixed `A33-hair-bounce` was always gate-side —
 * the cadence reference, and then the estimator's frequency axis; see
 * docs/ROUND4-PLAYER-ANIM.md §6c.
 */
export const MAX_SUB = 3;
// re-seat a chain whose root moved further than this in one frame (teleport)
export const RESEAT_D2 = 1.0;
// Rest-point derivative clamps. The old 40 m/s / 90 m/s^2 were "any number a
// numerical derivative could survive"; these are what the CHARACTER produces —
// 6.8 m/s of sprint plus a dodge's root motion, and the ~25 m/s^2 the pelvis
// bob puts through the spine at a 3.2 Hz step rate. Anything past them is a
// dropped frame differentiated twice, not motion.
export const DRIVE_V_MAX = 14;
export const DRIVE_A_MAX = 26;
// Ceiling on the velocity the length/bend/collision projection may hand back
// (m/s). Position-based dynamics feeds `|projection| / dt` into the velocity;
// with a 0.3 m projection at 60 Hz that is 9 m/s of free energy per frame.
export const PBD_V_MAX = 1.5;

