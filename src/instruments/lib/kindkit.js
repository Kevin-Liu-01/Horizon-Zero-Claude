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
  // a tool sits where its generator put it: the socket snap (rig/sockets.js) must not pull it onto a nearer
  // hull sample (a bob on a 9 mm cable snapped onto a leg); it rides its own bone, never re-parented
  // ...and it stands as hull for every OTHER socket (rig/sockets.js `countsAsHull`, read by A44b): the lamp weak point
  // on the drum reads the drum, the drum reads the trunnion it hangs from; a tool never vouches for itself
  if (part && part.mesh) { part.mesh.userData.noSnap = true; part.mesh.userData.noReparent = true; part.mesh.userData.toolHull = true; }
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

/**
 * Stand a parked Instrument on its feet where it now stands (M1a round 2): every leg in stance at its neutral home
 * under the CURRENT position and heading, planted on the terrain there, and the gait solved at rest until the pelvis
 * has followed the plants. For a machine moved or turned with its update stopped (the frame stager turns a staged
 * Instrument to face Brea after the settle, then freezes it): its feet had been planted for the old heading, and a
 * tripod on a slope stood one foot 0.14 m into the ground and another as far over it. Cold path; returns the
 * per-foot gap (foot sole minus terrain, m) after the solve.
 */
const _sf = new THREE.Vector3();
export function seatFeet(machine, steps = 40) {
  const g = machine?.gait, T = machine?.ctx?.terrain;
  if (!g?.legs?.length || !T) return null;
  const off = g.walk?.offsets || {};
  machine.root.updateMatrixWorld(true);
  const base = Math.floor(g.phase || 0);
  const plant = () => {
    g.phase = base;
    for (const leg of g.legs) {
      g._homeWorld(leg, 0, 0, _sf);
      _sf.y = T.getHeight(_sf.x, _sf.z) + leg.L.ankleH;
      leg.plant.copy(_sf); leg.target.copy(_sf); leg.swingFrom.copy(_sf);
      leg.planted = true; leg.inStance = true; leg.reachSwing = false;
      leg.ph = base + (off[leg.L.id] ?? 0);
    }
  };
  g._lastPos.copy(machine.position); g._lastHeading = machine.heading;
  g._turnS = 0; g._speedS = 0;
  const t0 = machine.ctx?.engine?.simTime ?? 0;
  for (let i = 0; i < steps; i++) {
    plant();
    g.update(1 / 60, t0);
  }
  machine.root.updateMatrixWorld(true);
  return g.legs.map((leg) => {
    leg.L.foot.getWorldPosition(_sf);
    return +(_sf.y - leg.L.ankleH - T.getHeight(_sf.x, _sf.z)).toFixed(3);
  });
}

/**
 * A LEVEL GLASS, NOT A LAMP (M2 wave 2; the Plumb's round 2 fix as one helper). A vial's or a flask's flat emissive
 * makes the machine's eye system take it for a lens (`Machine._collectEmissive`), and it then glows in the lamp's
 * state colour (the corrected Tiller's hopper vial filmed magenta-pink at 6e9c089). Every mesh whose name matches `re`
 * leaves `_eyeMats` and keeps its own pale ice at intensity 1; `levelGlassTick` takes it dark over 0.8 s on death.
 * Returns the glow records (call before `attachRigRuntime`, as the Gauge and the Plumb do).
 */
export function levelGlass(machine, re) {
  const out = [];
  machine.model.traverse((o) => {
    if (!o.isMesh || !re.test(o.name || '')) return;
    const m = o.material;
    if (!m || Array.isArray(m) || !m.emissive || out.some((g) => g.mat === m)) return;
    machine._eyeMats = machine._eyeMats.filter((e) => e.mat !== m);
    m.emissiveIntensity = 1;
    out.push({ mat: m, k: 1 });
  });
  return out;
}

/** Per update: the glass holds 1 while it lives and falls to 0 over 0.8 s once it is dead. */
export function levelGlassTick(machine, glows, dt) {
  for (let i = 0; i < glows.length; i++) {
    const g = glows[i];
    if (machine.alive ? g.k === 1 : g.k <= 0) continue;
    g.k = machine.alive ? 1 : Math.max(0, g.k - dt / 0.8);
    g.mat.emissiveIntensity = g.k;
  }
}

/**
 * TOOLS ON A HULL (M3 briefs §3.2; area C, wave 1, the smallest change here): `reseat(part)` puts a hit part that is
 * `off` back to `sealed` (the Davit's repair, `kinds/davit/rules.js`, is its one caller). A part is the hit-parts
 * seam's record `{ state: 'sealed' | 'seized' | 'off', hits? }` (M2 briefs §3.2; `kinds/screed-rules.js` `hitParts`).
 * Only an `off` part is re-seated: a sealed or seized one is left as it is. Returns true when it re-seated. The live
 * mesh's return to its bone is the kind's, in its behaviour wave.
 * @param {{ state: 'sealed' | 'seized' | 'off', hits?: number, seizedT?: number } | null | undefined} part
 * @returns {boolean}
 */
export function reseat(part) {
  if (!part || part.state !== 'off') return false;
  part.state = 'sealed';
  if (typeof part.hits === 'number') part.hits = 0;
  if (typeof part.seizedT === 'number') part.seizedT = 0;
  return true;
}
