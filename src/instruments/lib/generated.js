import * as THREE from 'three';

/**
 * Shared helpers for GENERATED Instrument kinds (instruments-core, Round 5).
 *
 * A generated kind's GLB (`tools/build/instruments/gen-*.mjs`, proven by
 * `tools/r5-poc/gen-creature.mjs`) carries in `asset.extras`:
 *   r5Rig        the autorig spec (BODY space, +Z forward, y = 0 at the feet)
 *   r5BoneOrder  bone names, indexed by the per-vertex `_bone` label
 *   r5Sockets    named body-space anchors (lens, lantern, hopper, …)
 *   r5Size       [x, y, z] metres
 * and every mesh carries a `_bone` vertex attribute: the generator's exact
 * per-vertex owner. These helpers turn that into the kept rig seam with 0 lines
 * changed in `autorig.js` / `gait.js`.
 *
 *   liftExtras(entry)            loadExtra `onEntry`: lift extras onto the entry,
 *                                keep the labels, DEQUANTISE once per kind, and
 *                                take the lamp/sensor mesh out of the shadow pass
 *   seedAuthoredWeights(machine) skin weights from the labels (rigid plates)
 *   weightAudit(machine)         labels vs the weights the rig actually binds
 *
 * Memory: all three run once per kind or once per spawn, never per frame; the
 * dequantised buffers belong to the asset entry and are shared by every clone.
 */

export function liftExtras(entry) {
  const ex = entry.gltf?.parser?.json?.asset?.extras || {};
  entry.r5Rig = ex.r5Rig;
  entry.r5BoneOrder = ex.r5BoneOrder;
  entry.r5Sockets = ex.r5Sockets;
  entry.r5Size = ex.r5Size;
  entry.root.traverse((o) => {
    if (!o.isMesh) return;
    // getX, not .array: meshopt streams arrive INTERLEAVED (stride 4), so the
    // backing array of a 1-byte attribute is 4x its vertex count
    const lab = o.geometry?.attributes?._bone;
    if (lab && !o.geometry.userData.r5Labels) {
      const labels = new Uint8Array(lab.count);
      for (let i = 0; i < lab.count; i++) labels[i] = lab.getX(i);
      o.geometry.userData.r5Labels = labels;
    }
    // DEQUANTISE ONCE PER KIND. `rig/lod.js` re-bakes secondary meshes with
    // setXYZ, which on a NORMALISED Int16 position clamps every vertex beyond
    // the node's [-1, 1] box (measured in the POC: lenses smeared 4.4 m).
    for (const name of Object.keys(o.geometry.attributes)) {
      const a = o.geometry.attributes[name];
      if (name === '_bone' || name.startsWith('skin')) continue;
      if (!a.normalized && !a.isInterleavedBufferAttribute && a.array instanceof Float32Array) continue;
      const f = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) {
        for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a.getComponent(i, c);
      }
      o.geometry.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
    }
    // the lamp/lens mesh is glass: it never holds a shadow-caster slot
    const mat = o.material;
    if (mat && /sensor|lamp|lens/i.test(mat.name || '')) { o.castShadow = false; o.userData.noShadow = true; }
  });
}

/** Seed autorig's per-geometry weight cache with the generator's exact ownership. */
export function seedAuthoredWeights(machine) {
  let seeded = 0;
  machine.model.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry;
    const labels = geo.userData.r5Labels;
    if (!labels || geo.userData.rigKind === machine.kind) return;
    const n = geo.attributes.position.count;
    const skinIndex = new Uint16Array(n * 4);
    const skinWeight = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { skinIndex[i * 4] = labels[i]; skinWeight[i * 4] = 1; }
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
    geo.userData.rigKind = machine.kind;            // autorig: "already captured"
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    if (!geo.userData.boundsPadded) { geo.boundingSphere.radius *= 1.6; geo.userData.boundsPadded = 1.6; }
    seeded += n;
  });
  return seeded;
}

/**
 * Labels vs bound weights: vertices whose dominant bone is not the generator's
 * owner, how many cross the leg/body line, and how many are blended.
 * `A-weights-authored` (per-kind block) asserts 0 wrong and >= 99.5 % rigid.
 */
export function weightAudit(machine) {
  const order = machine.ctx.assets.models[machine.modelKind]?.r5BoneOrder || [];
  const isLeg = (i) => /_(thigh|shin|foot)$/.test(order[i] || '');
  let n = 0, wrong = 0, cross = 0, blended = 0;
  const seen = new Set();
  machine.model.traverse((o) => {
    const g = o.geometry;
    if (!o.isMesh || !g || seen.has(g)) return;
    seen.add(g);
    const labels = g.userData.r5Labels;
    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    if (!labels || !si || labels.length !== si.count) return;
    for (let i = 0; i < si.count; i++) {
      n++;
      const dom = si.getX(i);
      if (sw.getY(i) > 0.08) blended++;
      if (dom !== labels[i]) {
        wrong++;
        if (isLeg(dom) !== isLeg(labels[i])) cross++;
      }
    }
  });
  return { verts: n, wrongDominant: wrong, legBodyCross: cross, blendedVerts: blended,
    rigidPct: n ? +(100 * (n - blended) / n).toFixed(2) : 0 };
}
