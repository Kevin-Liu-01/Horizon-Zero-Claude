import * as THREE from 'three';

/**
 * Shared per-kind helpers for the GENERATED Instruments (instruments-a W1; by the
 * §1.2 grant on `src/instruments/lib/**`). Every function here runs once per
 * kind or once per spawn — except `telegraphOnWindup`, which is a compare per
 * attack frame and allocates nothing.
 *
 *   prepareTools(entry)                    once per kind (`onEntry`): each tool node of the GLB
 *                                          (`extras.instrumentTool`, bible §7.3 "Tool") is re-centred
 *                                          on its anchor so a part's origin IS the anchor
 *   detachTool(machine, name) -> Mesh      BEFORE `buildRig`: take the tool out of the model so the
 *                                          rig never skins it
 *   mountTool(machine, mesh, opts) -> part AFTER `buildRig`: hang it on its bone as a component
 *                                          (`machine.addPart`: tearable, linked attack, loot)
 *   glintAnchor(machine, bone, at) -> Object3D   the striking end's glint point (I-05)
 *   telegraphOnWindup(machine, attack, anchor, r)  call from `attackPose(a)`: the first windup frame of
 *                                          each attack fires `machines.lamps.telegraph(...)`
 */

/** Once per kind: re-centre each tool's (shared) geometry on its anchor. */
export function prepareTools(entry) {
  if (!entry?.root || entry.toolsPrepared) return;
  entry.toolsPrepared = true;
  entry.tools = {};
  entry.root.traverse((o) => {
    if (!o.isMesh || !o.userData?.instrumentTool) return;
    const a = o.userData.anchor || [0, 0, 0];
    // bake the node's own transform first: a quantised (KHR_mesh_quantization) node carries the dequantising
    // scale + offset on the node, and the part re-parents the mesh with an identity transform
    o.updateMatrix();
    o.geometry.applyMatrix4(o.matrix);
    o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.set(1, 1, 1); o.updateMatrix();
    o.geometry.translate(-a[0], -a[1], -a[2]);
    o.geometry.computeBoundingSphere();
    o.geometry.computeBoundingBox();
    o.userData.noMerge = true;
    entry.tools[o.name] = a.slice();
  });
}

/** Before `buildRig`: the machine's clone of the tool mesh, out of the model (or null). */
export function detachTool(machine, name) {
  let mesh = null;
  machine.model.traverse((o) => { if (!mesh && o.isMesh && o.name === name) mesh = o; });
  if (mesh) mesh.parent?.remove(mesh);
  return mesh;
}

/**
 * After `buildRig`: mount the tool on `bone` (a rig bone name) as a component.
 * `anchor` is the tool's body-space anchor at scale 1 (the GLB's extras); `scale`
 * the machine's uniform scale. opts: { name, displayName, tearHp, linkedAttack,
 * loot, onTorn, weak, weakMult }.
 */
export function mountTool(machine, mesh, opts) {
  if (!mesh || !machine.rig) return null;
  const S = opts.scale ?? 1;
  const bone = machine.rig.bones?.[opts.bone] || machine.rig.pelvis;
  const bp = bone.userData.bodyPos || [0, 0, 0];
  const a = opts.anchor || [0, 0, 0];
  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  mesh.scale.setScalar(S);
  mesh.castShadow = false;
  const part = machine.addPart({
    name: opts.name, displayName: opts.displayName ?? opts.name, mesh, parent: bone,
    pos: [a[0] * S - bp[0], a[1] * S - bp[1], a[2] * S - bp[2]],
    tearHp: opts.tearHp ?? 60, linkedAttack: opts.linkedAttack ?? null,
    loot: opts.loot ?? [], onTorn: opts.onTorn ?? null, weak: !!opts.weak, weakMult: opts.weakMult ?? 2,
  });
  return part;
}

/** The striking end's glint point (I-05): an Object3D on `bone` at a body-space point (scale applied). */
export function glintAnchor(machine, bone, at, S = 1) {
  const b = machine.rig?.bones?.[bone] || machine.rig?.pelvis;
  const bp = b?.userData?.bodyPos || [0, 0, 0];
  const o = new THREE.Object3D();
  o.name = `glint-${bone}`;
  o.position.set(at[0] * S - bp[0], at[1] * S - bp[1], at[2] * S - bp[2]);
  b?.add(o);
  return o;
}

/**
 * I-05: the first windup frame of each attack telegraphs it through the lamp
 * (steady 1.6x HDR, pinhole) and a warm glint on the striking end. Call from the
 * kind's `attackPose(a)`; `machine._teleA` must be born null in the constructor.
 */
export function telegraphOnWindup(machine, a, anchor, glintR = 0.07) {
  if (a.phase !== 'windup' || machine._teleA === a) return false;
  machine._teleA = a;
  const L = machine.manager?.lamps;
  return L ? L.telegraph(machine, a.windup, anchor, glintR) : false;
}
