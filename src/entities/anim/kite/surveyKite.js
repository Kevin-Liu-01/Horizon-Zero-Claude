/**
 * M3 area B (M3.1), wave 2 LOOK: THE SURVEY KITE'S MESH AND ITS RECIPE (built from code at first use: 0 bytes shipped).
 *
 * BIBLE §9 / §16: "a two-cell box kite of split carrizo cane and undyed sailcloth with an orchil-dyed leading cell,
 * bridled to a cane crossbar she hangs from ... Carried furled as a roll ... Rectangular cells and visible spars."
 * BIBLE §5.2: furled, 0.95 x 0.12 m, in the survey case on the back; it leaves by the case's lower flap at the waist.
 * The originality checklist: never a triangular or membrane wing.
 *
 * What is here (KF9): two rectangular cells in tandem on four cane longerons; each cell a band of four stiff cloth panels
 * (top, bottom and the two sides; open fore and aft, as a box kite's cell is), the leading band orchil `#6B3F73`, the
 * trailing band undyed sailcloth with one patch of the wreck's cloth; hems and seams a shade darker; cane with node rings
 * and dark cord lashings at every joint; an X brace in the leading and the trailing face; four bridle cords to a cane
 * control bar with two leather grips where her hands go (BIBLE §12: 0.30-0.40 m in front of the chest, the grips a
 * shoulder-width and a fist apart: `KITE_RECIPE.grip`); three cord ties and a leather end cap that only show furled.
 * The cloth is stiff panels this wave (cloth on the kite is wave 3). One merged geometry, one material with vertex colours:
 * one draw, under 6 k triangles.
 *
 * THE FURL. Every vertex carries two places: OPEN (the kite flying) and FURLED (the kite rolled round its control bar into
 * a 0.95 x 0.12 m roll along the bar's axis). `setFurl(k)` puts the mesh at `k` (0 furled, 1 open) on the CPU: positions
 * and normals lerped, no allocation; the open and fold clips (./kiteClips.js) drive it. Furled, the roll's axis is the
 * bar's (local x) and the bar's centre is the roll's centre, so the hands that hold the roll hold the bar as it opens.
 *
 * Frame (as greyKite.js): the origin is the CENTRE OF THE CONTROL BAR; +x along the bar (her left), +y up, +z the way she
 * flies.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** The recipe (m). The open kite's dimensions are wave 1's (greyKite.js KITE_DIMS), so the hang and F51/F52 hold. */
export const KITE_RECIPE = Object.freeze({
  span: 2.6, cellH: 0.8, cellChord: 0.75, gap: 0.9, rise: 1.9, back: 0.15,
  /** cane: longeron and spar radii, the node rings' spacing */
  caneR: 0.014, sparR: 0.011, braceR: 0.008, nodeEvery: 0.42,
  /** cloth billow (stiff panels, filled by the wind) and the hem's width */
  billow: 0.035, hem: 0.03,
  /** the control bar; the grips (half the spread, as hangPose.js HANG.halfGrip) */
  barLen: 0.9, barR: 0.017, grip: 0.22, gripLen: 0.12,
  /** the bridle's cords (fix round 1: 4.5 mm broke into dashes at distance on the page; 7 mm holds a line at F52's range) */
  cord: 0.007,
  /** the furled roll (BIBLE §5.2: 0.95 x 0.12 m) */
  rollLen: 0.95, rollR: 0.06,
  /** sides of a cane's section */
  sides: 6,
});

/** Colours (sRGB): BIBLE §5.2's palette and the kite's row in §16. */
export const KITE_COLOURS = Object.freeze({
  orchil: 0x6b3f73, orchilHem: 0x4c2b55,
  sail: 0xcdbf9f, sailHem: 0xa99a7a, patch: 0xb9a888,
  cane: 0xb8a067, caneNode: 0x8f7a48, lash: 0x3b2c22, cord: 0x4a3a2c,
  grip: 0x5a3b26, cap: 0x6a4a30, tie: 0x5b4632,
});

const _c = new THREE.Color();
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** linear vertex colour of an sRGB hex, scaled by `k` (dust and fade) */
const lin = (hex, k = 1) => { _c.setHex(hex); return [_c.r * k, _c.g * k, _c.b * k]; };

const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _q = new THREE.Quaternion();

/** A part: an indexed geometry, a colour per vertex (or a function of the open place), and how it furls. */
function part(geo, colour, furl = 'roll') {
  if (!geo.index) throw new Error('surveyKite: parts are indexed');
  geo.deleteAttribute('uv');
  const n = geo.attributes.position.count, col = new Float32Array(n * 3), p = geo.attributes.position;
  for (let i = 0; i < n; i++) {
    const c = typeof colour === 'function' ? colour(p.getX(i), p.getY(i), p.getZ(i)) : colour;
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.userData.furl = furl;
  return geo;
}

/** a tapered cane from a to b (radius r0 at a, r1 at b), `sides` round */
function cane(a, b, r0, r1 = r0) {
  const L = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, L, KITE_RECIPE.sides, 1, true);
  _q.setFromUnitVectors(_up, _d.subVectors(b, a).normalize());
  g.applyQuaternion(_q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
/** a short band round a cane at point p along dir (a node ring or a lashing) */
function band(p, dir, r, len) {
  const g = new THREE.CylinderGeometry(r, r, len, KITE_RECIPE.sides, 1, false);
  _q.setFromUnitVectors(_up, _d.copy(dir).normalize());
  g.applyQuaternion(_q);
  g.translate(p.x, p.y, p.z);
  return g;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * A stiff cloth panel: a grid from corner `o` along `u` (nu cells) and `v` (nv cells), bowed out along `n` by `billow`
 * (the most at its middle, 0 at its edges, where the cane holds it).
 */
function panel(o, u, v, n, nu, nv, billow) {
  const pos = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const s = i / nu, t = j / nv, bw = billow * Math.sin(Math.PI * s) * Math.sin(Math.PI * t);
    pos.push(o.x + u.x * s + v.x * t + n.x * bw, o.y + u.y * s + v.y * t + n.y * bw, o.z + u.z * s + v.z * t + n.z * bw);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/**
 * The furled place of an open point (the roll round the bar: its axis the bar's, local x). The span folds to the roll's
 * length; the cells' height and chord wrap into its section, the cloth outside the cane, so the roll reads as cloth.
 * @param {number} x @param {number} y @param {number} z @param {'roll' | 'bar' | 'hide'} kind
 * @param {THREE.Vector3} out
 */
function furlOf(x, y, z, kind, out) {
  const R = KITE_RECIPE;
  if (kind === 'bar') return out.set(x * (R.rollLen / R.barLen) * 0.92, y, z);   // the bar stays the roll's core
  if (kind === 'hide') return out.set(0, 0, 0);                                  // ties: open, they are inside the bar
  const hs = R.span / 2;
  const lx = THREE.MathUtils.clamp(x / hs, -1, 1) * R.rollLen / 2;
  // the section: height (y over the bar, 0..rise+cellH) and chord (z) wound round the bar, radius by how far out it was
  const h = Math.max(0, y) / (R.rise + R.cellH), zc = -R.back, len = R.cellChord * 2 + R.gap;
  const c = THREE.MathUtils.clamp((z - zc) / (len / 2), -1, 1);
  const ang = Math.atan2(c, h * 2 - 1) + h * 2.4;
  const rad = R.barR + (R.rollR - R.barR) * (0.55 + 0.45 * Math.min(1, Math.hypot(c, h * 2 - 1)));
  return out.set(lx, Math.cos(ang) * rad, Math.sin(ang) * rad);
}

/**
 * Build the Survey Kite.
 * @param {{ furl?: number }} [o] the starting furl (1 open, as wave 1's grey kite)
 * @returns {{ group: THREE.Group, mesh: THREE.Mesh, triangles: number, draws: number, setFurl: (k: number) => void,
 *   furl: () => number, bounds: THREE.Box3, recipe: typeof KITE_RECIPE }}
 */
export function buildSurveyKite({ furl = 1 } = {}) {
  const R = KITE_RECIPE, C = KITE_COLOURS, hs = R.span / 2, y0 = R.rise, y1 = R.rise + R.cellH;
  const len = R.cellChord * 2 + R.gap, zc = -R.back, zf = zc + len / 2, za = zc - len / 2;
  const cells = [[zf - R.cellChord, zf, 'lead'], [za, za + R.cellChord, 'trail']];
  const parts = [];
  // dust and fade: the cloth a little lighter on top (the sun), darker low and at the trailing edge
  const fade = (x, y, z) => 0.92 + 0.1 * (y - y0) / R.cellH - 0.03 * Math.abs(x) / hs + 0.02 * Math.sin(x * 7.3 + z * 4.1);

  /* the cloth bands: each cell's top, bottom and two sides */
  for (const [z0, z1, which] of cells) {
    const c = z1 - z0, base = which === 'lead' ? C.orchil : C.sail, hem = which === 'lead' ? C.orchilHem : C.sailHem;
    const cloth = (patchAt) => (x, y, z) => {
      const k = fade(x, y, z);
      const edge = Math.min(z - z0, z1 - z) < R.hem || Math.min(Math.abs(x + hs), Math.abs(x - hs)) < R.hem * 0.6 || Math.min(Math.abs(y - y0), Math.abs(y - y1)) < R.hem * 0.6;
      if (patchAt && patchAt(x, y, z)) return lin(C.patch, k);
      return lin(edge ? hem : base, k);
    };
    // the trailing band carries one patch of the wreck's sailcloth (on its top, left of centre)
    const patch = which === 'trail' ? (x, y, z) => y > y1 - 0.01 && x > 0.25 && x < 0.75 && z > z0 + 0.2 && z < z1 - 0.18 : null;
    parts.push(part(panel(V(-hs, y1, z0), V(R.span, 0, 0), V(0, 0, c), V(0, 1, 0), 12, 4, R.billow), cloth(patch)));
    parts.push(part(panel(V(-hs, y0, z0), V(R.span, 0, 0), V(0, 0, c), V(0, -1, 0), 12, 4, R.billow * 0.6), cloth(null)));
    for (const sx of [-1, 1]) parts.push(part(panel(V(sx * hs, y0, z0), V(0, R.cellH, 0), V(0, 0, c), V(sx, 0, 0), 4, 4, R.billow * 0.8), cloth(null)));
    // the seam down the middle of the top and bottom panels (two widths of cloth): a darker stripe just proud of them
    for (const y of [y0, y1]) {
      const s = y === y1 ? 1 : -1;
      parts.push(part(panel(V(-0.012, y + s * (R.billow + 0.002), z0 + 0.02), V(0.024, 0, 0), V(0, 0, c - 0.04), V(0, s, 0), 1, 4, 0), lin(hem, 0.95)));
    }
  }

  /* the cane frame */
  const caneCol = (x, y, z) => lin(C.cane, 0.9 + 0.12 * Math.sin(x * 11 + y * 5 + z * 9));
  for (const x of [-hs, hs]) for (const y of [y0, y1]) {
    parts.push(part(cane(V(x, y, za - 0.04), V(x, y, zf + 0.04), R.caneR, R.caneR * 0.82), caneCol));
    for (let z = za + 0.1; z < zf - 0.05; z += R.nodeEvery) parts.push(part(band(V(x, y, z), V(0, 0, 1), R.caneR * 1.25, 0.018), lin(C.caneNode)));
  }
  for (const [z0, z1] of cells) for (const z of [z0, z1]) {
    // the cell edge's frame: spars across top and bottom, struts at the sides; lashed at the four corners
    parts.push(part(cane(V(-hs, y0, z), V(hs, y0, z), R.sparR), caneCol), part(cane(V(-hs, y1, z), V(hs, y1, z), R.sparR), caneCol));
    parts.push(part(cane(V(-hs, y0, z), V(-hs, y1, z), R.sparR), caneCol), part(cane(V(hs, y0, z), V(hs, y1, z), R.sparR), caneCol));
    for (const x of [-hs, hs]) for (const y of [y0, y1]) parts.push(part(band(V(x, y, z), V(1, 1, 0), R.caneR * 1.6, 0.05), lin(C.lash)));
  }
  // the X braces in the leading and the trailing face, lashed where they cross
  for (const z of [zf, za]) {
    parts.push(part(cane(V(-hs, y0, z), V(hs, y1, z), R.braceR), caneCol), part(cane(V(-hs, y1, z), V(hs, y0, z), R.braceR), caneCol));
    parts.push(part(band(V(0, (y0 + y1) / 2, z), V(0, 0, 1), R.braceR * 2.4, 0.03), lin(C.lash)));
  }

  /* the bridle: from each end of the bar to the bottom longerons at the two cells */
  const hb = R.barLen / 2;
  for (const sx of [-1, 1]) for (const z of [zf - R.cellChord * 0.5, za + R.cellChord * 0.5]) {
    parts.push(part(cane(V(sx * (hb - 0.03), 0, 0), V(sx * hs * 0.55, y0, z), R.cord), lin(C.cord), 'roll'));
  }
  /* the control bar, its grips and the bridle's knots at its ends */
  const bar = new THREE.CylinderGeometry(R.barR, R.barR, R.barLen, 8, 1, false); bar.rotateZ(Math.PI / 2);
  parts.push(part(bar, (x) => lin(C.cane, 0.85 + 0.1 * Math.sin(x * 23)), 'bar'));
  for (const sx of [-1, 1]) {
    const g = new THREE.CylinderGeometry(R.barR * 1.35, R.barR * 1.35, R.gripLen, 8, 1, false); g.rotateZ(Math.PI / 2); g.translate(sx * R.grip, 0, 0);
    parts.push(part(g, lin(C.grip), 'bar'));
    parts.push(part(band(V(sx * (hb - 0.03), 0, 0), V(1, 0, 0), R.barR * 1.7, 0.035), lin(C.lash), 'bar'));
  }
  /* furled only: three cord ties round the roll and a leather cap at each end (open, they sit inside the bar) */
  const hideParts = [];
  for (const x of [-0.3, 0, 0.3]) { const g = new THREE.CylinderGeometry(R.rollR * 1.04, R.rollR * 1.04, 0.025, 10, 1, true); g.rotateZ(Math.PI / 2); g.translate(x, 0, 0); hideParts.push(part(g, lin(C.tie), 'hide')); }
  for (const sx of [-1, 1]) { const g = new THREE.CylinderGeometry(R.rollR * 1.06, R.rollR * 1.06, 0.06, 10, 1, false); g.rotateZ(Math.PI / 2); g.translate(sx * (R.rollLen / 2 - 0.03), 0, 0); hideParts.push(part(g, lin(C.cap), 'hide')); }

  /* both places of every vertex; normals for each from its own part (smooth within a part) */
  const all = [...parts, ...hideParts];
  const tmp = new THREE.Vector3();
  for (const g of all) {
    const kind = g.userData.furl, p = g.attributes.position, n = p.count;
    const open = new Float32Array(p.array), fur = new Float32Array(n * 3);
    if (kind === 'hide') {
      // furled: the tie or cap where it was built; open: collapsed into the bar's centre
      fur.set(open);
      for (let i = 0; i < n * 3; i++) open[i] = 0;
    } else {
      for (let i = 0; i < n; i++) { furlOf(open[i * 3], open[i * 3 + 1], open[i * 3 + 2], kind, tmp); fur[i * 3] = tmp.x; fur[i * 3 + 1] = tmp.y; fur[i * 3 + 2] = tmp.z; }
    }
    g.setAttribute('position', new THREE.BufferAttribute(fur, 3)); g.computeVertexNormals(); const nf = new Float32Array(g.attributes.normal.array);
    g.setAttribute('position', new THREE.BufferAttribute(open, 3));
    if (kind === 'hide') g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nf), 3)); else g.computeVertexNormals();
    g.setAttribute('openPos', new THREE.BufferAttribute(new Float32Array(g.attributes.position.array), 3));
    g.setAttribute('openNrm', new THREE.BufferAttribute(new Float32Array(g.attributes.normal.array), 3));
    g.setAttribute('furlPos', new THREE.BufferAttribute(fur, 3));
    g.setAttribute('furlNrm', new THREE.BufferAttribute(nf, 3));
  }
  const geo = mergeGeometries(all, false);
  for (const g of all) g.dispose();
  const P = geo.attributes.position, N = geo.attributes.normal;
  const oP = geo.attributes.openPos.array, oN = geo.attributes.openNrm.array, fP = geo.attributes.furlPos.array, fN = geo.attributes.furlNrm.array;
  // the four places live on the CPU only: they are not drawn
  for (const k of ['openPos', 'openNrm', 'furlPos', 'furlNrm']) geo.deleteAttribute(k);
  P.setUsage(THREE.DynamicDrawUsage); N.setUsage(THREE.DynamicDrawUsage);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  mat.name = 'survey-kite';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'survey-kite';
  mesh.castShadow = true;
  // the furl moves every vertex: its bounds are the open kite's (the furled roll is inside them); never culled on a
  // stale sphere
  mesh.frustumCulled = false;
  const group = new THREE.Group();
  group.name = 'kite';
  group.add(mesh);
  let cur = -1;
  const pa = P.array, na = N.array, count = P.count;
  const setFurl = (k) => {
    k = Math.min(1, Math.max(0, k));
    if (Math.abs(k - cur) < 1e-4) return;
    cur = k;
    // the cells rise first and spread fore and aft last: the span opens with k, the height by k = 0.55 and the chord from
    // k = 0.2 (so a kite opening or folding over her hands stands up in front of her face, a thin column, and
    // spreads fore and aft only once it is above her head: the aft cell never sweeps through her head or her chest)
    // (fix round 1: the chord from k = 0.2, was 0.45: half open, the cells stood edge-on and the bare spars and bridle
    //  read as a triangular frame; now the two cells read as boxes from k = 0.5)
    const kx = k, ky = sstep(0, 0.55, k), kz = sstep(0.2, 0.9, k);
    for (let i = 0, n3 = count * 3; i < n3; i += 3) {
      pa[i] = fP[i] + (oP[i] - fP[i]) * kx; pa[i + 1] = fP[i + 1] + (oP[i + 1] - fP[i + 1]) * ky; pa[i + 2] = fP[i + 2] + (oP[i + 2] - fP[i + 2]) * kz;
      na[i] = fN[i] + (oN[i] - fN[i]) * k; na[i + 1] = fN[i + 1] + (oN[i + 1] - fN[i + 1]) * k; na[i + 2] = fN[i + 2] + (oN[i + 2] - fN[i + 2]) * k;
    }
    for (let i = 0; i < count; i++) { const j = i * 3, l = Math.hypot(na[j], na[j + 1], na[j + 2]) || 1; na[j] /= l; na[j + 1] /= l; na[j + 2] /= l; }
    P.needsUpdate = true; N.needsUpdate = true;
  };
  // bounds: the open kite (furled lies inside)
  for (let i = 0; i < count * 3; i++) pa[i] = oP[i];
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  setFurl(furl);
  return { group, mesh, triangles: geo.index.count / 3, draws: 1, setFurl, furl: () => cur, bounds: geo.boundingBox.clone(), recipe: R };
}

const _pw = new THREE.Vector3(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion();
/**
 * Put the kite where the hang's last solve put it (`animator.hangPoseInfo().kite`: its origin and turn in her character
 * frame, `root` being the object whose local frame that is: `animator.space.root`, else her model) and set its furl.
 * @param {{ group: THREE.Object3D, setFurl: (k: number) => void }} K  buildSurveyKite's result
 * @param {THREE.Object3D} root
 * @param {{ kite: { pos: number[], quat: number[], furl: number } }} info
 */
export function placeKite(K, root, info) {
  const k = info.kite, g = K.group;
  root.updateMatrixWorld(true);
  _pw.fromArray(k.pos); root.localToWorld(_pw);
  root.getWorldQuaternion(_qw).multiply(_qp.fromArray(k.quat));
  if (g.parent) { g.parent.updateMatrixWorld(true); g.parent.worldToLocal(_pw); _qw.premultiply(g.parent.getWorldQuaternion(_qp).invert()); }
  g.position.copy(_pw); g.quaternion.copy(_qw);
  g.updateMatrixWorld(true);
  K.setFurl(k.furl);
  return g;
}
