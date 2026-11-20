/**
 * M3 area B (M3.1), wave 1 BLOCKOUT: the grey Survey Kite. A box frame only (no look work): two rectangular cells in
 * tandem, four longerons, the cells' cross spars and side struts, the sail bands as thin grey panels, the bridle and the
 * cane control bar she hangs from. One merged geometry, one grey material: one draw.
 *
 * BIBLE §9: a two-cell box kite of split cane and sailcloth, bridled to a cane crossbar she hangs from; rectangular
 * cells and visible spars, never a triangular or membrane wing. The orchil leading cell, the undyed cloth, the furled
 * roll and the 512² set are wave 2 (KF9).
 *
 * Frame: the kite's origin is the CENTRE OF THE CONTROL BAR; +x along the bar (her left), +y up, +z the way she flies.
 * `placeAtBar(kite, model, barChar)` puts that origin on the hang pose's bar (`animator.hangPoseInfo().bar`, in the
 * model's own space) with the model's orientation.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Blockout dimensions (m). */
export const KITE_DIMS = Object.freeze({
  /** span of a cell along the bar */
  span: 2.6,
  /** a cell's height and chord */
  cellH: 0.8, cellChord: 0.75,
  /** gap between the leading and trailing cell */
  gap: 0.9,
  /** the bottom of the cells over the bar */
  rise: 1.9,
  /** the kite's centre of the cells behind the bar (the bridle's set) */
  back: 0.15,
  /** spar and panel thickness */
  spar: 0.025, panel: 0.006,
  /** the control bar */
  barLen: 0.9, barR: 0.016,
});

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();

/** a box of section t x t from a to b */
function rod(a, b, t) {
  const L = a.distanceTo(b);
  const g = new THREE.BoxGeometry(t, L, t);
  _q.setFromUnitVectors(_up, _b.subVectors(b, a).normalize());
  g.applyQuaternion(_q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Build the grey kite.
 * @param {{ color?: THREE.ColorRepresentation }} [o]
 * @returns {{ group: THREE.Group, mesh: THREE.Mesh, triangles: number, draws: number, bounds: THREE.Box3 }}
 */
export function buildGreyKite({ color = 0x8c8c8c } = {}) {
  const D = KITE_DIMS, hs = D.span / 2, y0 = D.rise, y1 = D.rise + D.cellH;
  const len = D.cellChord * 2 + D.gap, zc = -D.back, zf = zc + len / 2, za = zc - len / 2;
  const parts = [];
  // the four longerons, fore to aft at the cells' corners
  for (const x of [-hs, hs]) for (const y of [y0, y1]) parts.push(rod(V(x, y, za), V(x, y, zf), D.spar));
  // each cell: fore and aft edges, spars across the top and bottom, struts at the sides; the sail band (top, bottom, two sides)
  for (const [z0, z1] of [[zf - D.cellChord, zf], [za, za + D.cellChord]]) {
    for (const z of [z0, z1]) {
      parts.push(rod(V(-hs, y0, z), V(hs, y0, z), D.spar), rod(V(-hs, y1, z), V(hs, y1, z), D.spar));
      parts.push(rod(V(-hs, y0, z), V(-hs, y1, z), D.spar), rod(V(hs, y0, z), V(hs, y1, z), D.spar));
    }
    const zm = (z0 + z1) / 2, c = z1 - z0;
    parts.push(box(D.span, D.panel, c, 0, y0, zm), box(D.span, D.panel, c, 0, y1, zm));
    parts.push(box(D.panel, D.cellH, c, -hs, (y0 + y1) / 2, zm), box(D.panel, D.cellH, c, hs, (y0 + y1) / 2, zm));
  }
  // the cross brace in each end of the frame (visible spars: an X across the leading face and the trailing face)
  for (const z of [zf, za]) parts.push(rod(V(-hs, y0, z), V(hs, y1, z), D.spar * 0.8), rod(V(-hs, y1, z), V(hs, y0, z), D.spar * 0.8));
  // the bridle: from each end of the bar to the bottom longerons' fore and aft cell edges
  const hb = D.barLen / 2;
  for (const sx of [-1, 1]) for (const z of [zf - D.cellChord * 0.5, za + D.cellChord * 0.5]) parts.push(rod(V(sx * hb, 0, 0), V(sx * hs * 0.55, y0, z), 0.006));
  // the cane control bar
  const bar = new THREE.CylinderGeometry(D.barR, D.barR, D.barLen, 8, 1);
  bar.rotateZ(Math.PI / 2);
  parts.push(bar);
  const geo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  for (const g of parts) g.dispose();
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'kite-grey-blockout';
  mesh.castShadow = true;
  const group = new THREE.Group();
  group.name = 'kite';
  group.add(mesh);
  return { group, mesh, triangles: geo.attributes.position.count / 3, draws: 1, bounds: geo.boundingBox.clone() };
}

/**
 * Put the kite's origin (the bar's centre) on the hang pose's bar, in the model's orientation.
 * @param {THREE.Object3D} kite
 * @param {THREE.Object3D} model  the player's model (whose local space the hang pose's bar is given in)
 * @param {number[] | {x: number, y: number, z: number}} barChar
 */
export function placeAtBar(kite, model, barChar) {
  model.updateMatrixWorld(true);
  _a.set(barChar[0] ?? barChar.x, barChar[1] ?? barChar.y, barChar[2] ?? barChar.z);
  model.localToWorld(_a);
  if (kite.parent) kite.parent.worldToLocal(_a);
  kite.position.copy(_a);
  model.getWorldQuaternion(kite.quaternion);
  if (kite.parent) kite.quaternion.premultiply(kite.parent.getWorldQuaternion(_q).invert());
  kite.updateMatrixWorld(true);
  return kite;
}
