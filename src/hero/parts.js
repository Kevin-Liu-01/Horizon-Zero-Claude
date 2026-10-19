/**
 * CALIMA · binding a part (outfit, stow kit, armor piece) onto the live hero
 * skeleton (hero-body W0b; plan E9 "outfit merge + skeleton dispose"; the
 * proof's `attachOutfit` / `disposeMesh`, promoted).
 *
 * A part GLB is authored on the SAME 65-joint bind as the body (plus any dyn_
 * chain it skins to), so each of its SkinnedMeshes keeps its own inverse binds
 * and bindMatrix and is re-pointed at the hero's bones BY NAME. Geometry and
 * materials stay the loaded source's (shared, owned by `ctx.assets`); what a
 * bind creates — the SkinnedMesh and its Skeleton (which owns a bone
 * DataTexture, one GL texture) — is exactly what `releasePart` disposes. The
 * proof measured +1 GPU texture per mesh per swap without `skeleton.dispose()`.
 */
import * as THREE from 'three';

/** name -> Bone under `root`. */
export function boneIndex(root) {
  const m = new Map();
  root.traverse((o) => { if (o.isBone && !m.has(o.name)) m.set(o.name, o); });
  return m;
}

/** The node every hero mesh hangs under (the body's parent), or the root. */
export function armatureOf(root) {
  let arm = null;
  root.traverse((o) => { if (!arm && o.isSkinnedMesh) arm = o.parent; });
  return arm || root;
}

/**
 * Bind clones of every SkinnedMesh under `srcRoot` to `heroRoot`'s bones.
 * Returns the new meshes (already parented). Throws if a joint is missing.
 */
export function bindPart(heroRoot, srcRoot, tag, { castShadow = false, bones = null } = {}) {
  const map = bones || boneIndex(heroRoot);
  const arm = armatureOf(heroRoot);
  const made = [];
  const srcs = [];
  srcRoot.traverse((o) => { if (o.isSkinnedMesh) srcs.push(o); });
  for (const src of srcs) {
    const mapped = src.skeleton.bones.map((b) => map.get(b.name));
    const miss = src.skeleton.bones.filter((b, i) => !mapped[i]).map((b) => b.name);
    if (miss.length) throw new Error(`[hero] part ${tag}/${src.name}: bones missing on the hero: ${miss.join(', ')}`);
    const m = new THREE.SkinnedMesh(src.geometry, src.material);
    m.name = src.name;
    m.position.copy(src.position);
    m.quaternion.copy(src.quaternion);
    m.scale.copy(src.scale);
    m.frustumCulled = false;            // skinned bounds come from the bind pose; she is always on screen
    m.castShadow = castShadow;
    m.receiveShadow = true;
    m.userData.heroPart = tag;
    arm.add(m);
    m.bind(new THREE.Skeleton(mapped, src.skeleton.boneInverses), src.bindMatrix);
    made.push(m);
  }
  return made;
}

/**
 * Remove and dispose what `bindPart` created: the mesh leaves the graph, its
 * Skeleton (bone texture) is disposed, and the player's fade clone of its
 * material is released through `player.releaseMaterial` when the source
 * material is not used by any other live mesh. Geometry and source materials
 * are the assets' and stay.
 */
export function releasePart(meshes, player = null) {
  let skeletons = 0;
  for (const m of meshes) {
    m.removeFromParent();
    if (m.skeleton) { m.skeleton.dispose(); skeletons++; }
    m.skeleton = null;
  }
  if (player?.releaseMaterialsOf) player.releaseMaterialsOf(meshes);
  return { skeletons };
}

/**
 * The hide mask (bible §3.9 "the merge culls body faces fully hidden under the
 * equipped outfit through a per-set hide mask"). Body triangles whose three
 * vertices carry `bit` in `_hidemask` are moved to the END of the index buffer
 * and cut off with the draw range: no new GPU buffer, no allocation per frame,
 * and the shadow pass honours it too. `bit = 0` restores the full body.
 */
export class HideMask {
  constructor(mesh) {
    this.mesh = mesh;
    const g = mesh.geometry;
    const a = g.getAttribute('_hidemask') || null;
    // a 1-byte meshopt attribute arrives INTERLEAVED (stride padded to 4): read
    // it through getX once into a flat per-vertex mask, never through `.array`
    this.attr = a ? { array: Uint8Array.from({ length: a.count }, (_, i) => a.getX(i)) } : null;
    this.index = g.getIndex();
    this.full = this.index ? this.index.array.slice() : null;   // the authored order, kept once
    this.bit = 0;
    this.hiddenTris = 0;
  }

  apply(bit) {
    if (!this.attr || !this.index) return 0;
    const arr = this.index.array, src = this.full, mask = this.attr.array;
    const n = src.length;
    if (!bit) {
      arr.set(src);
      this.mesh.geometry.setDrawRange(0, Infinity);
      this.hiddenTris = 0;
    } else {
      let w = 0, back = n;
      for (let t = 0; t < n; t += 3) {
        const a = src[t], b = src[t + 1], c = src[t + 2];
        if ((mask[a] & mask[b] & mask[c] & bit) !== 0) {
          back -= 3; arr[back] = a; arr[back + 1] = b; arr[back + 2] = c;
        } else {
          arr[w] = a; arr[w + 1] = b; arr[w + 2] = c; w += 3;
        }
      }
      this.mesh.geometry.setDrawRange(0, w);
      this.hiddenTris = (n - w) / 3;
    }
    this.index.needsUpdate = true;
    this.bit = bit;
    return this.hiddenTris;
  }

  /** Triangles drawn right now. */
  visibleTris() { return this.index ? (this.full.length / 3) - this.hiddenTris : 0; }
}
