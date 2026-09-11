import * as THREE from 'three';

/**
 * Published machine bounds — what the machine actually MEASURES on screen.
 *
 * `Machine`'s `size` / `height` come from the loaded GLB's normalised
 * descriptor (`ctx.assets.models[kind].size`), decided before this lane's
 * silhouette pass runs. Round 4 then kitbashed plate shells on top of five of
 * the eight species and retired the donor sculpt underneath — so for those
 * five the descriptor describes a mesh that is no longer drawn, and for the
 * rest it describes the sculpt without its shell.
 *
 * That is not cosmetic. `ctx.hitHulls.raycast()` broadphases every machine
 * with a bounding sphere built from exactly those numbers:
 *
 *     cy  = m.position.y + m.height * 0.5
 *     rad = 0.5 * max(m.size.x, m.size.z, m.height) + 1.2
 *
 * A ray that misses that sphere is never tested against the machine's hulls
 * at all. Measured before this file existed: the Glinthawk's shell spans
 * 6.4 x 6.9 m of wing against a declared 2.6 x 1.4 m, and its sphere fell
 * 1.05 m short of its own wingtips — **10 of 50 arrows fired at drawn
 * glinthawk triangles registered nothing** (gate `A50b`). The Behemoth was
 * 0.76 m short; the Thunderjaw and Sawtooth had 0.14 m and 0.30 m of margin
 * on a walk cycle that swings further than that.
 *
 * So the rig publishes what it drew. `size` is only ever GROWN — a species
 * whose descriptor is already generous keeps it — and it is replaced with a
 * machine-owned vector rather than mutated, because `size` is the asset
 * descriptor and every machine of the species shares the object.
 *
 * `height` is deliberately NOT touched: it is a gameplay quantity (LOD rings,
 * shadow rings, corpse mass, eye heights) and the broadphase does not need it
 * to be wrong-side-conservative to work.
 *
 * Cost: eight corners per drawable mesh, on the first LOD tick and then once
 * every `REFRESH_FRAMES` — tens of float ops, off the hot path.
 */

const _v = /* @__PURE__ */ new THREE.Vector3();

/** Frames between refreshes. A gait swings; a tear changes the silhouette. */
export const REFRESH_FRAMES = 120;

/** Extra slack on the measured extent, for the part of a cycle we did not see. */
const PAD = 1.12;

/**
 * Measure the machine's drawable geometry and publish it.
 *
 * Uses each geometry's own bounding box rather than its vertices: a bind box
 * is a conservative envelope of every pose the skeleton can reach, which is
 * the right side to be wrong on for a broadphase, and it costs nothing.
 * Retired donor sculpts (`userData.noHull`) are excluded — they are not drawn,
 * and on the Glinthawk and Longleg they are a different shape entirely.
 *
 * Meshes that are momentarily invisible (distance LOD, the engine's
 * small-mesh cull, the FX pool's glow sources) still count: they come back,
 * and a bound that breathed with the LOD tier would be worse than useless.
 *
 * @param {object} machine
 * @returns {{x:number,z:number,minY:number,maxY:number,meshes:number}|null}
 */
export function publishDrawnBounds(machine) {
  const root = machine?.root;
  if (!root) return null;
  root.updateWorldMatrix(false, true);
  let ex = 0, ez = 0, minY = Infinity, maxY = -Infinity, n = 0;
  const px = machine.position.x, pz = machine.position.z;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (o.userData.noHull || o.userData.hiddenSculpt) return;   // retired donor
    let bb = o.geometry.boundingBox;
    if (!bb) { o.geometry.computeBoundingBox(); bb = o.geometry.boundingBox; }
    if (!bb) return;
    n++;
    for (let i = 0; i < 8; i++) {
      _v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z)
        .applyMatrix4(o.matrixWorld);
      const dx = Math.abs(_v.x - px), dz = Math.abs(_v.z - pz);
      if (dx > ex) ex = dx;
      if (dz > ez) ez = dz;
      if (_v.y < minY) minY = _v.y;
      if (_v.y > maxY) maxY = _v.y;
    }
  });
  if (!n || !Number.isFinite(minY)) return null;
  const out = machine.drawnBounds || (machine.drawnBounds = {});
  out.x = ex * 2 * PAD;          // centred extents, the way the sphere reads them
  out.z = ez * 2 * PAD;
  out.minY = minY;
  out.maxY = maxY;
  out.meshes = n;

  // grow-only, and never into the shared asset descriptor
  const s = machine.size;
  const wantX = Math.max(s ? s.x : 0, out.x);
  const wantZ = Math.max(s ? s.z : 0, out.z);
  const wantY = Math.max(s ? s.y : 0, maxY - minY);
  if (!s || !s.isVector3 || s !== machine._ownSize) {
    machine.size = machine._ownSize = new THREE.Vector3(wantX, wantY, wantZ);
  } else {
    s.set(wantX, wantY, wantZ);
  }
  return out;
}

/**
 * Call once per machine per frame; measures on the first call and then every
 * `REFRESH_FRAMES`. Cheap enough to be unconditional.
 */
export function tickDrawnBounds(machine) {
  const f = machine.ctx?.engine?.frames ?? 0;
  const due = machine._boundsFrame === undefined || f - machine._boundsFrame >= REFRESH_FRAMES;
  if (!due) return machine.drawnBounds || null;
  machine._boundsFrame = f;
  return publishDrawnBounds(machine);
}
