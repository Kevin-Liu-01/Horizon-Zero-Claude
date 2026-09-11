import * as THREE from 'three';
import { BoneSpace, AXIS_X, AXIS_Y, AXIS_Z } from './boneSpace.js';
import { RestPose } from './restPose.js';
import { ClipLayer, ClipLayerSet, timeScaleSelfTest, stuckDetectorSelfTest } from './clipLayer.js';
import { RigDebug } from './rigDebug.js';

/**
 * anim registry — `__CTX__.anim` (gate A26-one-convention).
 *
 * Every rig module in the game declares itself here with the bone-rotation
 * convention it uses. `audit()` then answers, at runtime and on the live rig,
 * the question perf-tech-11 asked: *is there one convention yet?*
 *
 * It does not take anyone's word for it. For each rig module that is reachable
 * through `ctx` it runs a NON-DESTRUCTIVE equivalence probe: apply the
 * module's own rotation helper to a real bone, record the resulting local
 * quaternion, restore the bone, apply BoneSpace's equivalent, and compare. A
 * module whose private helper is proved bit-identical to BoneSpace is
 * `BoneSpace/verified` — the migration is a pure import swap and cannot change
 * a single frame. A module that DIVERGES is `legacy` and fails the audit —
 * for the ALOY rig and for the MACHINE rigs alike (`audit().ok` carries an
 * `aloy.ok` term and a `machines.ok` term, and `legacyModules` is derived from
 * the KNOWN_MODULES table below rather than from who volunteered to register).
 * That is the regression detector the two animation lanes need while they
 * migrate in Waves 1 and 2.
 *
 * Ownership: `anim-core` owns `src/entities/anim/**` only. The migration
 * recipes for files owned by other lanes live in `docs/ROUND4-ANIM-CORE.md`
 * and are listed by `audit().pendingMigration` with their owning lane.
 */

export const ANIM_VERSION = '4.0.0';
export const MIGRATION_DOC = 'docs/ROUND4-ANIM-CORE.md';

/**
 * Every rig module in the repo, its owner lane, and where it stands.
 * `probe` names a runtime equivalence check implemented below.
 *
 * status: 'migrated'        imports anim-core, no private convention left
 *         'import-swap'     private helper proved identical to BoneSpace;
 *                           the owning lane swaps the import in its wave
 *         'pending'         still on its own convention, owner + wave named
 */
const KNOWN_MODULES = [
  { id: 'anim/boneSpace', file: 'src/entities/anim/boneSpace.js', owner: 'anim-core', rig: 'shared', convention: 'BoneSpace', status: 'migrated' },
  { id: 'anim/restPose', file: 'src/entities/anim/restPose.js', owner: 'anim-core', rig: 'shared', convention: 'BoneSpace', status: 'migrated' },
  { id: 'anim/clipLayer', file: 'src/entities/anim/clipLayer.js', owner: 'anim-core', rig: 'shared', convention: 'ClipLayer', status: 'migrated' },
  { id: 'anim/rigDebug', file: 'src/entities/anim/rigDebug.js', owner: 'anim-core', rig: 'shared', convention: 'BoneSpace', status: 'migrated' },
  { id: 'anim/retargeter', file: 'src/entities/anim/retargeter.js', owner: 'anim-core', rig: 'aloy', convention: 'BoneSpace', status: 'migrated' },
  { id: 'anim/clipLibrary', file: 'src/entities/anim/clipLibrary.js', owner: 'anim-core', rig: 'aloy', convention: 'BoneSpace', status: 'migrated' },
  { id: 'anim/locomotion', file: 'src/entities/anim/locomotion.js', owner: 'anim-core', rig: 'aloy', convention: 'ClipLayer', status: 'migrated' },
  {
    id: 'playerAnimator', file: 'src/entities/playerAnimator.js', owner: 'player-anim', wave: 2,
    rig: 'aloy', convention: 'BoneSpace (private _rot/_rotQ/_rotL/_rotQL)',
    status: 'import-swap', probe: 'playerAnimator',
    recipe: `BoneSpace.adopt(this._entries, model) then _rot->rotCharBind, _rotQ->rotCharBindQ, _rotL->rotChar, _rotQL->rotCharQ (${MIGRATION_DOC} §2)`,
  },
  {
    id: 'machines/gait', file: 'src/entities/machines/gait.js', owner: 'machine-rig', wave: 1,
    rig: 'machines', convention: 'local-axis rotX/rotY/rotZ + Map rest',
    status: 'pending', probe: 'machineLocal',
    recipe: `rotX/Y/Z -> BoneSpace.rotLocal; rig.rest Map -> RestPose (${MIGRATION_DOC} §3)`,
  },
  {
    id: 'machines/species', file: 'src/entities/machines/{watcher,strider,sawtooth,thunderjaw,scrapper,behemoth}.js',
    owner: 'machine-rig', wave: 1, rig: 'machines', convention: "local-axis _rot(bone,'x',a) + Map rest",
    status: 'pending', probe: 'machineLocal',
    recipe: `_rot -> BoneSpace.rotLocal; this._rest Map -> RestPose.fromMap (${MIGRATION_DOC} §3)`,
  },
  {
    id: 'machines/glinthawk', file: 'src/entities/machines/glinthawk.js', owner: 'machine-rig', wave: 1,
    rig: 'machines', convention: 'AnimationMixer + setTimeout one-shot',
    status: 'pending', probe: 'mixerSpecies', risk: 'WALL-CLOCK one-shot restore (A27): setTimeout survives engine.timeScale',
    recipe: `this._act -> ClipLayerSet; _oneShot -> set.oneShot(name) (${MIGRATION_DOC} §4)`,
  },
  {
    id: 'machines/longleg', file: 'src/entities/machines/longleg.js', owner: 'machine-rig', wave: 1,
    rig: 'machines', convention: 'AnimationMixer + local-axis neck overlay',
    status: 'pending', probe: 'mixerSpecies',
    recipe: `this._act -> ClipLayerSet; neck quaternion.multiply -> BoneSpace.rotLocal (${MIGRATION_DOC} §4)`,
  },
];

/* ------------------------- runtime registrations ------------------------- */

const _registered = new Map();

/**
 * A module declares itself at construction time.
 * @param {object} spec { id, file, owner, rig, convention, status, space, layers }
 */
export function register(spec) {
  if (!spec?.id) return null;
  const rec = { ...spec, at: Date.now() };
  _registered.set(spec.id, rec);
  return rec;
}

export function unregister(id) { _registered.delete(id); }
export function registered() { return [..._registered.values()]; }

/* ---------------------------- equivalence probes ---------------------------- */

const _probeAxes = [AXIS_X, AXIS_Y, AXIS_Z, new THREE.Vector3(0.31, 0.87, -0.39).normalize()];
const _probeAngle = 0.13704;
const _probeQ = new THREE.Quaternion().setFromAxisAngle(_probeAxes[3], 0.2137);

const _cmpA = new THREE.Quaternion();
const _cmpB = new THREE.Quaternion();

/**
 * Angle (radians) between two orientations, sign- and magnitude-insensitive.
 * The normalize is load-bearing: bones posed by an AnimationMixer hold
 * quaternions built from FLOAT32 track data, so |q| is 1 - O(1e-8) and a raw
 * dot product of a quaternion with an identical copy of itself reads
 * acos(1 - 2e-8) = 2e-4 rad of phantom error. Cold path; two scratch objects.
 */
function angleBetween(a, b) {
  _cmpA.copy(a).normalize();
  _cmpB.copy(b).normalize();
  return 2 * Math.acos(Math.min(1, Math.abs(_cmpA.dot(_cmpB))));
}

/**
 * Run `legacyFn` and `boneSpaceFn` on the same bone from the same start pose
 * and return the angular difference. Fully restores the bone.
 */
function compare(bone, legacyFn, boneSpaceFn) {
  const save = bone.quaternion.clone();
  let worst = 0;
  try {
    for (const axis of _probeAxes) {
      bone.quaternion.copy(save);
      legacyFn(axis, _probeAngle);
      const a = bone.quaternion.clone();
      bone.quaternion.copy(save);
      boneSpaceFn(axis, _probeAngle);
      worst = Math.max(worst, angleBetween(a, bone.quaternion));
    }
  } finally {
    bone.quaternion.copy(save);
  }
  return worst;
}

/**
 * playerAnimator's four private helpers vs BoneSpace, on the LIVE Aloy rig.
 * Non-destructive: every bone is restored.
 */
function probePlayerAnimator(ctx) {
  const an = ctx?.player?.animator;
  if (!an || !an._entries || !an.model) return { reachable: false, why: 'no ctx.player.animator' };
  const names = ['spine_01_06', 'head_0104', 'upperarm_r_043', 'thigh_l_0185', 'hand_l_014'];
  const bs = BoneSpace.adopt(an._entries, an.model);
  // use the animator's OWN cached frame inverse so the live-space comparison
  // is not a frame off (it refreshes _invModelQ at the top of each update)
  if (an._invModelQ) bs.setFrameInv(an._invModelQ); else bs.syncFrame();

  const deltas = {};
  let worst = 0, checked = 0;
  for (const n of names) {
    const e = an._entries[n];
    if (!e || typeof an._rot !== 'function') continue;
    checked++;
    const d = {
      _rot: compare(e.bone, (ax, a) => an._rot(e, ax, a), (ax, a) => bs.rotChar(e, ax, a, true)),
      _rotL: typeof an._rotL === 'function'
        ? compare(e.bone, (ax, a) => an._rotL(e, ax, a), (ax, a) => bs.rotChar(e, ax, a, false)) : null,
      _rotQ: typeof an._rotQ === 'function'
        ? compare(e.bone, () => an._rotQ(e, _probeQ), () => bs.rotCharQ(e, _probeQ, true)) : null,
      _rotQL: typeof an._rotQL === 'function'
        ? compare(e.bone, () => an._rotQL(e, _probeQ), () => bs.rotCharQ(e, _probeQ, false)) : null,
    };
    for (const k in d) if (d[k] != null) worst = Math.max(worst, d[k]);
    deltas[n] = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v == null ? null : +v.toExponential(2)]));
  }
  const table = bs.validate();
  return {
    reachable: true, checked, bones: Object.keys(an._entries).length,
    entryTableValid: table.ok, badEntries: table.bad,
    maxDeltaRad: +worst.toExponential(2), deltas,
    identical: checked > 0 && worst < 1e-5 && table.ok,
  };
}

/** Machine species `_rot(bone, 'x', a)` vs BoneSpace.rotLocal. */
function probeMachineLocal(ctx) {
  const list = ctx?.machines?.list || [];
  const m = list.find((x) => typeof x?._rot === 'function' && x?._rest?.size && x?.root);
  if (!m) return { reachable: false, why: 'no machine exposes _rot + _rest yet' };
  const bone = [...m._rest.keys()].find((b) => b && b.isBone !== undefined) || [...m._rest.keys()][0];
  if (!bone) return { reachable: false, why: 'empty rest table' };
  const bs = new BoneSpace(m.root);
  const AX = { x: AXIS_X, y: AXIS_Y, z: AXIS_Z };
  let worst = 0;
  for (const k of ['x', 'y', 'z']) {
    worst = Math.max(worst, compare(bone,
      () => m._rot(bone, k, _probeAngle),
      () => bs.rotLocal(bone, AX[k], _probeAngle)));
  }
  return {
    reachable: true, kind: m.kind, bone: bone.name, restBones: m._rest.size,
    maxDeltaRad: +worst.toExponential(2), identical: worst < 1e-5,
  };
}

/** Mixer species: do their one-shots schedule on the wall clock? */
function probeMixerSpecies(ctx) {
  const list = ctx?.machines?.list || [];
  const out = [];
  for (const kind of ['glinthawk', 'longleg']) {
    const m = list.find((x) => x?.kind === kind && x?.mixer);
    if (!m) { out.push({ kind, reachable: false }); continue; }
    const src = typeof m._oneShot === 'function' ? String(m._oneShot) : '';
    out.push({
      kind, reachable: true,
      actions: Object.keys(m._act || {}).length,
      usesClipLayerSet: !!m.layers?.audit,
      wallClockOneShot: /setTimeout|setInterval|Date\.now|performance\.now/.test(src),
    });
  }
  return out;
}

const PROBES = {
  playerAnimator: probePlayerAnimator,
  machineLocal: probeMachineLocal,
  mixerSpecies: probeMixerSpecies,
};

/* --------------------------------- audit --------------------------------- */

/** Pure-algebra check that BoneSpace's four spaces do what the docs claim. */
export function algebraSelfTest() {
  const root = new THREE.Object3D();
  root.quaternion.setFromAxisAngle(AXIS_Y, 0.9);
  const parent = new THREE.Bone();
  parent.name = 'p';
  parent.quaternion.setFromAxisAngle(new THREE.Vector3(0.2, 0.5, 0.84).normalize(), 0.7);
  parent.position.set(0, 1, 0);
  const child = new THREE.Bone();
  child.name = 'c';
  child.quaternion.setFromAxisAngle(AXIS_X, -0.4);
  child.position.set(0, 0.4, 0);
  parent.add(child);
  root.add(parent);
  root.updateMatrixWorld(true);

  const bs = new BoneSpace(root, { all: true });
  const e = bs.entry('c');
  const before = new THREE.Quaternion();
  const after = new THREE.Quaternion();
  const want = new THREE.Quaternion();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0.3, -0.6, 0.74).normalize(), 0.33);
  const res = {};

  // rotChar (live): char orientation must be premultiplied by q, exactly
  bs.syncFrame();
  bs.charQ(child, before);
  bs.rotCharQ(e, q, false);
  root.updateMatrixWorld(true);
  bs.charQ(child, after);
  want.copy(q).multiply(before);
  res.rotChar = +angleBetween(after, want).toExponential(2);
  child.quaternion.copy(e.bindQ); root.updateMatrixWorld(true);

  // rotWorld: world orientation premultiplied by q, exactly
  child.getWorldQuaternion(before);
  bs.rotWorldQ(e, q);
  root.updateMatrixWorld(true);
  child.getWorldQuaternion(after);
  want.copy(q).multiply(before);
  res.rotWorld = +angleBetween(after, want).toExponential(2);
  child.quaternion.copy(e.bindQ); root.updateMatrixWorld(true);

  // rotLocal: identical to the legacy bone.quaternion.multiply(axisAngle)
  const legacy = e.bindQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_Z, 0.21));
  bs.rotLocal(e, AXIS_Z, 0.21);
  res.rotLocal = +angleBetween(child.quaternion, legacy).toExponential(2);
  child.quaternion.copy(e.bindQ); root.updateMatrixWorld(true);

  // rotChar(bind) is EXACTLY the legacy W/invW form
  const legacyBind = e.bindQ.clone().multiply(
    e.invW.clone().multiply(q).multiply(e.W));
  bs.rotCharQ(e, q, true);
  res.rotCharBind = +angleBetween(child.quaternion, legacyBind).toExponential(2);
  child.quaternion.copy(e.bindQ); root.updateMatrixWorld(true);

  // setCharQ: absolute write
  bs.setCharQ(e, q);
  root.updateMatrixWorld(true);
  bs.charQ(child, after);
  res.setCharQ = +angleBetween(after, q).toExponential(2);

  const worst = Math.max(...Object.values(res));
  return { pass: worst < 1e-5, maxDeltaRad: worst, checks: res };
}

/**
 * The A26 payload: what exists, what convention every rig module uses, and
 * proof for the ones that are reachable.
 */
export function audit(ctx) {
  const c = ctx || (typeof window !== 'undefined' ? window.__CTX__ : null);

  const modules = {
    BoneSpace: typeof BoneSpace === 'function',
    RestPose: typeof RestPose === 'function',
    ClipLayer: typeof ClipLayer === 'function',
    ClipLayerSet: typeof ClipLayerSet === 'function',
    RigDebug: typeof RigDebug === 'function',
  };
  const modulesPresent = Object.values(modules).every(Boolean);
  const algebra = algebraSelfTest();

  const probeCache = {};
  const runProbe = (name) => {
    if (!name) return null;
    if (!(name in probeCache)) probeCache[name] = PROBES[name] ? PROBES[name](c) : null;
    return probeCache[name];
  };

  const rows = KNOWN_MODULES.map((m) => {
    const live = _registered.get(m.id);
    const probe = runProbe(m.probe);
    let convention = live?.convention || m.convention;
    let status = live ? 'migrated' : m.status;
    let verified = null;

    if (m.probe === 'playerAnimator' && probe?.reachable) {
      verified = probe.identical;
      convention = probe.identical
        ? 'BoneSpace/verified (private helpers proved identical)'
        : 'DIVERGENT from BoneSpace';
      if (!probe.identical) status = 'legacy';
    } else if (m.probe === 'machineLocal' && probe?.reachable) {
      verified = probe.identical;
      convention = probe.identical
        ? 'BoneSpace.rotLocal/verified (local-axis, identical)'
        : 'DIVERGENT from BoneSpace.rotLocal';
      // A divergent machine rig is `legacy` exactly like a divergent Aloy one.
      // Without this line machine-rig could land a Wave 1 migration that
      // changes the algebra and A26 would still be green — the regression
      // detector this module documents itself as would not exist.
      if (!probe.identical) status = 'legacy';
    } else if (m.probe === 'mixerSpecies' && Array.isArray(probe)) {
      const kind = m.id.split('/')[1];
      const row = probe.find((p) => p.kind === kind);
      if (row?.reachable) {
        verified = row.usesClipLayerSet ? !row.wallClockOneShot : null;
        if (row.usesClipLayerSet) {
          convention = row.wallClockOneShot
            ? 'ClipLayerSet claimed but a WALL-CLOCK one-shot is still in the source'
            : 'ClipLayerSet/verified (mixer-time one-shots)';
          // claiming the migration while keeping a setTimeout restore is the
          // one way this row can regress: fail, do not just print it
          status = row.wallClockOneShot ? 'legacy' : 'migrated';
        }
      }
    }
    return {
      id: m.id, file: m.file, owner: m.owner, wave: m.wave ?? 0, rig: m.rig,
      convention, status, verified,
      ...(m.risk ? { risk: m.risk } : {}),
      ...(m.recipe && status !== 'migrated' ? { recipe: m.recipe } : {}),
    };
  });

  // Two different counters, and conflating them was a real hole in the first
  // Round 4 drop:
  //
  //   selfDeclaredForeign  modules that VOLUNTARILY called register() carrying
  //                        a non-anim-core convention. A module that never
  //                        registers is invisible here, so an empty list is
  //                        satisfiable by silence — it is a diagnostic, never
  //                        the bar.
  //   legacyModules        rows from the KNOWN_MODULES table (which enumerates
  //                        every rig module in the repo, registered or not)
  //                        that a LIVE probe proved divergent. This is the
  //                        regression detector, and it is what gates A26.
  const selfDeclaredForeign = registered().filter(
    (r) => !/BoneSpace|ClipLayer/.test(r.convention || '')).map((r) => r.id);
  const legacyModules = rows.filter((r) => r.status === 'legacy')
    .map((r) => ({ id: r.id, owner: r.owner, convention: r.convention }));

  const aloyRows = rows.filter((r) => r.rig === 'aloy');
  const aloyDivergent = aloyRows.filter((r) => /DIVERGENT/.test(r.convention) || r.status === 'legacy');
  const anProbe = probeCache.playerAnimator ?? runProbe('playerAnimator');
  const aloy = {
    rows: aloyRows.map((r) => `${r.id}: ${r.convention}`),
    boneSpaceRouted: aloyRows.length - aloyDivergent.length,
    divergent: aloyDivergent.map((r) => r.id),
    animatorProbe: anProbe,
    ok: aloyDivergent.length === 0 && (!anProbe?.reachable || anProbe.identical === true),
  };

  const pendingMigration = rows
    .filter((r) => r.status !== 'migrated')
    .map((r) => ({ id: r.id, owner: r.owner, wave: r.wave, status: r.status, recipe: r.recipe, risk: r.risk }));

  const conventions = {};
  for (const r of rows) {
    const key = /BoneSpace/.test(r.convention) ? 'BoneSpace'
      : /ClipLayer/.test(r.convention) ? 'ClipLayer'
        : r.convention;
    conventions[key] = (conventions[key] || 0) + 1;
  }

  const machineLocal = probeCache.machineLocal ?? runProbe('machineLocal');
  const machineMixer = probeCache.mixerSpecies ?? runProbe('mixerSpecies');
  const machines = {
    local: machineLocal,
    mixer: machineMixer,
    // Health, on the same footing as `aloy.ok`. A machine rig that is still
    // pending is fine (its lane has not started); one that is reachable and
    // DIVERGENT is not, and neither is one claiming ClipLayerSet while a
    // wall-clock restore is still in its source.
    ok: (machineLocal?.reachable !== true || machineLocal.identical === true)
      && (Array.isArray(machineMixer)
        ? machineMixer.every((m) => !(m.reachable && m.usesClipLayerSet && m.wallClockOneShot))
        : true),
  };

  return {
    ok: modulesPresent && algebra.pass && legacyModules.length === 0
      && aloy.ok && machines.ok,
    version: ANIM_VERSION,
    doc: MIGRATION_DOC,
    modules, modulesPresent,
    algebra,
    conventions,
    rigModules: rows,
    registered: registered().map((r) => ({ id: r.id, owner: r.owner, convention: r.convention, rig: r.rig })),
    legacyModules,
    selfDeclaredForeign,
    aloy,
    machines,
    pendingMigration,
  };
}

/** RestPose + RigDebug smoke test on a throwaway 2-bone rig. */
export function rigSelfTest() {
  const root = new THREE.Object3D();
  const hip = new THREE.Bone(); hip.name = 'hip'; hip.position.set(0, 1, 0);
  const foot = new THREE.Bone(); foot.name = 'foot'; foot.position.set(0, -0.9, 0.1);
  hip.add(foot); root.add(hip);
  root.updateMatrixWorld(true);

  const space = new BoneSpace(root, { all: true });
  const rest = new RestPose({ space, positions: true });
  const dbg = new RigDebug({ space, label: 'selftest' });

  // pose away from bind, then prove RestPose puts it back exactly
  space.rotLocal(space.entry('hip'), AXIS_X, 0.5);
  foot.position.y -= 0.2;
  const posed = dbg.probe('hip').deltaDeg;
  rest.restore();
  root.updateMatrixWorld(true);
  const restored = dbg.probe('hip').deltaDeg;
  const posOk = Math.abs(foot.position.y + 0.9) < 1e-9;

  // clip-driven split
  rest.markClipDriven(['hip']);
  const split = rest.report();

  // the canonical debugFeet payload
  const feet = dbg.feet([{ name: 'foot', planted: true, yOffset: 0.05 }]);
  const ground = RigDebug.groundError(feet, { getHeight: () => feet[0].world.y });

  return {
    pass: posed > 20 && restored < 1e-3 && posOk
      && split.clipDriven === 1 && split.reset === 1
      && feet.length === 1 && feet[0].planted === true
      && Math.abs(feet[0].world.y - (1 - 0.9 - 0.05)) < 1e-6
      && ground.samples === 1 && ground.max < 1e-9,
    posedDeg: posed, restoredDeg: restored, restorePositions: posOk,
    restPose: split, feet, groundError: ground.max,
  };
}

/** Everything that can be proven without the game running. */
export function selftest(timeScale = 0.02) {
  const algebra = algebraSelfTest();
  const clip = timeScaleSelfTest(timeScale);
  const stuck = stuckDetectorSelfTest(timeScale);
  const rig = rigSelfTest();
  return {
    pass: algebra.pass && clip.pass && stuck.pass && rig.pass,
    algebra, clipLayer: clip, stuckDetector: stuck, rig,
  };
}

/* ------------------------------ live RigDebug ------------------------------ */
/**
 * `RigDebug` is only useful on film if a gate or a console can reach one
 * WITHOUT owning the rig's file. These two helpers resolve a rig by name and
 * cache its debugger, so the skeleton overlay, the per-bone probes and
 * `debugFeet()` are one call away for every lane:
 *
 *   __CTX__.anim.overlay('aloy')            // skeleton on, on the live scene
 *   __CTX__.anim.debug('watcher').probe('hipsBone_03')
 *   __CTX__.anim.overlay('aloy', false)
 *
 * Cold path: it allocates, walks the scene graph and refreshes the char frame
 * on every call. Never call it from a hot loop.
 */
const _debuggers = new Map();

/** Resolve 'aloy' | 'player' | a machine kind | an Object3D | a machine. */
function resolveRig(target) {
  const c = anim.ctx || (typeof window !== 'undefined' ? window.__CTX__ : null);
  if (!target || target === 'aloy' || target === 'player') {
    const an = c?.player?.animator;
    if (!an?.model) return null;
    // adopt the animator's own entry table so probes carry bind + deltaDeg,
    // and its own cached frame inverse so char values are not a frame stale
    const space = BoneSpace.adopt(an._entries || {}, an.model);
    if (an._invModelQ) space.setFrameInv(an._invModelQ); else space.syncFrame();
    return { key: 'aloy', space, root: an.model };
  }
  if (typeof target === 'string') {
    const m = (c?.machines?.list || []).find((x) => x?.kind === target && x?.root);
    return m ? { key: target, space: new BoneSpace(m.root), root: m.root } : null;
  }
  // BoneSpace first: it also carries a `.root`, so the machine branch below
  // would otherwise shadow it and build a second space over the same rig.
  if (target instanceof BoneSpace) return { key: target.root?.uuid || 'space', space: target, root: target.root };
  if (target.isObject3D) return { key: target.uuid, space: new BoneSpace(target), root: target };
  if (target.root?.isObject3D) {
    return { key: target.uuid || target.kind || 'rig', space: new BoneSpace(target.root), root: target.root };
  }
  return null;
}

/**
 * Cached `RigDebug` for a rig (see resolveRig for what `target` accepts).
 * Returns null when the rig is not in the scene yet.
 */
export function debug(target = 'aloy') {
  const r = resolveRig(target);
  if (!r) return null;
  const had = _debuggers.get(r.key);
  // an Aloy debugger caches a stale frame inverse between frames; refresh it
  if (had) { had.space.syncFrame?.(); return had; }
  const d = new RigDebug({ space: r.space, root: r.root, label: String(r.key) });
  _debuggers.set(r.key, d);
  return d;
}

/**
 * Toggle a rig's skeleton overlay on the live scene (`ctx.scene`).
 * @returns {boolean|null} the resulting visibility, or null if unreachable
 */
export function overlay(target = 'aloy', on = true) {
  const c = anim.ctx || (typeof window !== 'undefined' ? window.__CTX__ : null);
  const d = debug(target);
  if (!d || !c?.scene) return null;
  if (on) { d.overlay(c.scene, true); return true; }
  d.hideOverlay();
  return false;
}

/** Drop every cached debugger and its overlay (rig respawn / scene teardown). */
export function clearDebuggers() {
  for (const d of _debuggers.values()) d.disposeOverlay();
  _debuggers.clear();
}

/* --------------------------------- ctx API --------------------------------- */

export const anim = {
  version: ANIM_VERSION,
  doc: MIGRATION_DOC,
  BoneSpace, RestPose, ClipLayer, ClipLayerSet, RigDebug,
  AXIS_X, AXIS_Y, AXIS_Z,
  register, unregister, registered,
  audit, selftest, algebraSelfTest, timeScaleSelfTest, stuckDetectorSelfTest, rigSelfTest,
  debug, overlay, clearDebuggers,
  ctx: null,
  /** Explicit hook for core-platform: `ctx.anim = anim.attach(ctx)` in main.js. */
  attach(ctx) {
    anim.ctx = ctx || null;
    if (ctx && typeof ctx === 'object') ctx.anim = anim;
    return anim;
  },
};

/**
 * Publish without editing another lane's file.
 *
 * `src/main.js` (core-platform) does `window.__CTX__ = ctx` in shot mode; this
 * module is loaded long before that (playerAnimator -> clipLibrary ->
 * registry), so intercepting the assignment is the only way for anim-core to
 * land on `ctx` under the Round 4 ownership rules. core-platform should
 * replace this with a one-line `anim.attach(ctx)` in main.js; the interceptor
 * then becomes a no-op because `ctx.anim` is already set.
 */
function publish() {
  if (typeof window === 'undefined') return;
  window.__ANIM__ = anim;
  const cur = window.__CTX__;
  if (cur && typeof cur === 'object') { anim.attach(cur); return; }
  const d = Object.getOwnPropertyDescriptor(window, '__CTX__');
  if (d && !d.configurable) return;
  let held = cur;
  try {
    Object.defineProperty(window, '__CTX__', {
      configurable: true,
      enumerable: true,
      get() { return held; },
      set(v) { held = v; if (v && typeof v === 'object' && !v.anim) anim.attach(v); },
    });
  } catch { /* a stricter host already owns the property; __ANIM__ still works */ }
}
publish();
