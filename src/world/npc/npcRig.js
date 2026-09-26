import * as THREE from 'three';

/**
 * NPC RIG SOURCE — lane `npc` (port 5218).
 *
 * WHY THIS IS THE CHEAPEST CORRECT ANSWER IN THE REPO.
 *
 * `public/anims/AnimationLibrary_Godot_Standard.gltf` is the Quaternius
 * Universal Animation Library (CC0, `public/anims/LICENSE`). Round 4's
 * character lane loads it only for its 46 clips and retargets them onto Aloy's
 * 424-joint rig — but the file also ships the rig those clips were AUTHORED on:
 * a 53-joint humanoid skeleton (`Rig` > `root` > `DEF-*`) with a `Mannequin`
 * skinned mesh on it. Measured on port 5218: `bindMatrix` is identity, the
 * bind pose is a clean T-pose, +Y up, +Z forward, 1.75 m tall, feet at y ≈ 0.
 *
 * So for a crowd of NPCs there is no retargeting problem at all: clone the
 * skeleton, bind our own body geometry to it, and play the pack's clips
 * DIRECTLY. Zero bake cost, zero retarget error, zero foot-slide introduced by
 * a mapping — the walk cycle on an NPC is the walk cycle the animator authored.
 *
 * WHAT WE DO NOT SHIP. The Mannequin itself is an orange-and-purple robot
 * dummy; it is never added to the scene (and its geometry is never cloned or
 * disposed here — it belongs to `ctx.assets`). `npcBody.js` generates a real
 * human body, outfit and gear as ONE skinned mesh per NPC, bound to this
 * skeleton. See `models-staging/npc/MANIFEST.md` for the sourcing decision and
 * the license record.
 *
 * DRAW BUDGET. One `SkinnedMesh` per NPC — body, clothes, hair and carried gear
 * are all in the same buffer, rigid props weighted 1.0 to the bone they hang
 * from. 13 NPCs cost 13 draws, which is what the six-mesh baked crowd this
 * replaces already cost.
 */

/**
 * Bone names this lane addresses by hand.
 *
 * WRITTEN ONCE AT LOAD, THEN CORRECTED. `GLTFLoader` runs every node name
 * through `PropertyBinding.sanitizeNodeName`, which strips the characters an
 * animation track path reserves — so the pack's `DEF-spine.001` arrives in
 * three as `DEF-spine001` and `DEF-toe.L` as `DEF-toeL`. The rig source
 * rewrites these to whatever the loaded skeleton actually calls them
 * (`NpcRigSource._bindNames`), so both spellings resolve and a loader change
 * cannot silently strand every skin weight on bone 0.
 */
export const B = {
  root: 'root',
  hips: 'DEF-hips',
  spine1: 'DEF-spine.001',
  spine2: 'DEF-spine.002',
  spine3: 'DEF-spine.003',
  neck: 'DEF-neck',
  head: 'DEF-head',
  shoulderL: 'DEF-shoulder.L',
  shoulderR: 'DEF-shoulder.R',
  upperArmL: 'DEF-upper_arm.L',
  upperArmR: 'DEF-upper_arm.R',
  forearmL: 'DEF-forearm.L',
  forearmR: 'DEF-forearm.R',
  handL: 'DEF-hand.L',
  handR: 'DEF-hand.R',
  thighL: 'DEF-thigh.L',
  thighR: 'DEF-thigh.R',
  shinL: 'DEF-shin.L',
  shinR: 'DEF-shin.R',
  footL: 'DEF-foot.L',
  footR: 'DEF-foot.R',
  toeL: 'DEF-toe.L',
  toeR: 'DEF-toe.R',
};

/**
 * The clips this lane uses, by logical slot. Every name is a real clip in the
 * pack (verified: 46 clips, listed in the manifest).
 */
export const NPC_CLIPS = {
  idle: 'Idle_Loop',
  idleTalk: 'Idle_Talking_Loop',
  idleTorch: 'Idle_Torch_Loop',
  walk: 'Walk_Loop',
  walkFormal: 'Walk_Formal_Loop',
  jog: 'Jog_Fwd_Loop',
  sitEnter: 'Sitting_Enter',
  sitIdle: 'Sitting_Idle_Loop',
  sitTalk: 'Sitting_Talking_Loop',
  sitExit: 'Sitting_Exit',
  interact: 'Interact',
  pickup: 'PickUp_Table',
  fixing: 'Fixing_Kneeling',
  /**
   * KEPT AS A SLOT, NEVER PLAYED. `Push_Loop` travels 0.3565 m/s with no air
   * path, and only GAIT slots drive the body, so as a work loop it was pure
   * foot slide (see `IN_PLACE_MAX` in npcAnim.js). It stays in the table so the
   * boot-time bake measures it and `play()` can refuse it by name rather than by
   * its absence — put it back in a pool and the console says why it will not run.
   */
  push: 'Push_Loop',
  dance: 'Dance_Loop',
  swordIdle: 'Sword_Idle',
  crouchIdle: 'Crouch_Idle_Loop',
  jab: 'Punch_Jab',
  tpose: 'A_TPose',
};

let _shared = null;

export class NpcRigSource {
  /**
   * @param {{scene: THREE.Object3D, animations: THREE.AnimationClip[]}} ualGltf
   *        `ctx.assets.anims.ual` — loaded raw, never added to the scene.
   */
  constructor(ualGltf) {
    this.ok = false;
    if (!ualGltf?.scene) return;

    const rig = ualGltf.scene.getObjectByName('Rig') || ualGltf.scene;
    let skinned = null;
    rig.traverse((o) => { if (!skinned && o.isSkinnedMesh) skinned = o; });
    if (!skinned?.skeleton) return;

    this.srcRig = rig;
    this.srcSkeleton = skinned.skeleton;
    this.bindMatrix = skinned.bindMatrix.clone();

    /** the bone that parents the whole hierarchy (`root`) */
    this.srcRoot = rig.getObjectByName(B.root)
      || this.srcSkeleton.bones.find((b) => !b.parent?.isBone)
      || this.srcSkeleton.bones[0];

    /** name -> index in `skeleton.bones` */
    this.index = new Map();
    this.srcSkeleton.bones.forEach((b, i) => this.index.set(b.name, i));
    this._bindNames();

    /**
     * World-space BIND transform of every bone — `inverse(boneInverse)`. This
     * is the space `npcBody.js` builds geometry in, and it is the space the
     * `bindMatrix` (identity, measured) maps from.
     */
    this.bindWorld = this.srcSkeleton.boneInverses.map((m) => m.clone().invert());
    this.bindPos = new Map();
    const v = new THREE.Vector3();
    this.srcSkeleton.bones.forEach((b, i) => {
      this.bindPos.set(b.name, v.setFromMatrixPosition(this.bindWorld[i]).clone());
    });

    /** clip name -> AnimationClip (shared; actions are per-mixer) */
    this.clips = new Map();
    for (const c of (ualGltf.animations || [])) this.clips.set(c.name, c);

    /** measured character height at bind (top of head ≈ head joint + 0.18) */
    const head = this.bindPos.get(B.head);
    this.bindHeight = (head?.y ?? 1.569) + 0.185;
    this.ok = true;
  }

  /** One source per boot — the bind data is read-only and shared. */
  static shared(assets) {
    if (_shared) return _shared;
    const src = new NpcRigSource(assets?.anims?.ual);
    if (!src.ok) return null;
    _shared = src;
    return _shared;
  }

  static reset() { _shared = null; }

  /** Point `B` at the names this skeleton really uses. See the note on `B`. */
  _bindNames() {
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    let lookup = null;
    for (const key of Object.keys(B)) {
      const want = B[key];
      if (this.index.has(want)) continue;
      const stripped = want.replace(/\./g, '');
      if (this.index.has(stripped)) { B[key] = stripped; continue; }
      if (!lookup) {
        lookup = new Map();
        for (const n of this.index.keys()) lookup.set(norm(n), n);
      }
      const got = lookup.get(norm(want));
      if (got) B[key] = got;
      else console.warn(`[npc] rig has no bone for "${want}" — that part will not deform`);
    }
  }

  clip(name) { return this.clips.get(name) || null; }
  pos(name) { return this.bindPos.get(name); }
  idx(name) { return this.index.get(name); }

  /**
   * A fresh, independent skeleton: the bone hierarchy is deep-cloned and a new
   * `THREE.Skeleton` is built over it with its own copies of the bind inverses.
   * The Mannequin meshes are NOT cloned — they are `ctx.assets` property and
   * this lane never draws them.
   *
   * @returns {{ root: THREE.Bone, skeleton: THREE.Skeleton, byName: Map<string, THREE.Bone> }}
   */
  instantiate() {
    const root = this.srcRoot.clone(true);
    const byName = new Map();
    root.traverse((o) => { if (o.name) byName.set(o.name, o); });
    const bones = this.srcSkeleton.bones.map((b) => byName.get(b.name) || b);
    const skeleton = new THREE.Skeleton(bones, this.srcSkeleton.boneInverses.map((m) => m.clone()));
    return { root, skeleton, byName };
  }
}
