/**
 * CALIMA — recipe: Brea, the protagonist body (hero-body, W0b; bible §3.3–§3.5,
 * §3.8 step 1 + 4; plan §2 hero-body row, §4.1 "Brea body + head + hair + wrap +
 * eyes ≤ 10 k, ≤ 2 draws").
 *
 *   node tools/build/build-assets.mjs --only hero-body
 *
 * OUTPUT public/models/hero/brea.glb — ONE skeleton (UBC 65 joints + the dyn_
 * chains below) and exactly TWO skinned meshes:
 *   Brea_Skin      body + eyes, one material on a 1024² skin atlas (eyes packed
 *                  into the unused top-right strip of the UBC layout)
 *   Brea_HairWrap  coil shell, brows, topknot, headwrap band, wrap knot, wrap
 *                  tail, knot tail — one material on a 512² atlas
 *
 * dyn_ chains (the kept spring solver discovers them by name, class by regex):
 *   dyn_hairKnotTail_01..04 + _end   Head      class hair   (A33-hair-bounce)
 *   dyn_wrapSash_01..06 + _end       Head      class cloth  (wrap tail, left-rear)
 *   dyn_sashEnd_01..03 + _end        pelvis    class cloth  (outfit sash, left hip)
 *   dyn_alidadeCord_01..02 + _end    spine_03  fallback     (alidade on the sternum)
 *
 * FACE (bible §3.5, gate A-face-delta): a displacement field (sum of Gaussian
 * bumps at the seven landmarks, found on the mesh) moves head, brows, eyes and
 * coil shell together; the eye sockets are held rigid (18 mm falloff). Then the
 * PAINT layer is composited onto the skin atlas from a bind-space position map:
 * warm olive-brown skin, sun creases, the salt-line (#EDEAE2 paste, 8 mm, cheek
 * to cheek across the nose bridge, crackled), a 3 cm scar through the left
 * brow (the brow hair is cut along it) and the ∴ on the back of the right hand.
 * Eyes dark brown #3B2A20; brows heavy and straight (×1.08).
 *
 * HIDE MASK: every body vertex carries `_HIDEMASK` (uint8). Bit 0 = covered by
 * Pan Whites I (computed against that outfit's bind geometry: a ray along the
 * vertex normal meets the outfit within 8 cm). `src/hero/outfit.js` drops body
 * triangles whose three vertices carry the equipped set's bit, at equip time.
 *
 * extras.r5Hero   { bodyHeight, totalHeight, targetHeight, chains }
 * extras.r5Face   { stock / displaced landmark positions, deltas (game mm),
 *                   profile window + stock profile mask (RLE), IoU }
 *
 * Sources (CC0): Quaternius Universal Base Characters [Standard]
 * (Superhero_Female_FullBody, Hair_BuzzedFemale, eye + hair textures).
 */
import sharp from 'sharp';
import path from 'node:path';
import { MeshoptSimplifier } from 'meshoptimizer';
import { joinPrimitives } from '@gltf-transform/functions';
import {
  ROOT, srcRoot, UBC_DIR, HAIR_DIR, readGltf, cleanDoc, nodeByName, graft, addChain, jointIndex, jointPos,
  newGeo, appendGeo, tubeAlong, stripAlong, bun, band, findLandmarks, GRADED, faceField, applyField,
  recomputeNormals, positionMap, noise3, hex, smooth, profileMask, iou, rle, writeSkinned, v3,
} from './lib/face.mjs';

export const LANE = 'hero-body';
export const OUTPUTS = ['public/models/hero/brea.glb', 'public/models/hero/brea-clips-ual2.glb'];

/**
 * UAL2 clips Brea plays NATIVELY (same 65-joint UBC skeleton, no retarget;
 * R15: UAL2 is a clip source for climb, slide, consume): extracted from
 * UAL2_Standard.glb (CC0) into a mesh-less pack, rotations only (+ pelvis
 * translation), so the pack is a few hundred KB, not 8 MB.
 */
export const UAL2_CLIPS = ['ClimbUp_1m', 'Slide_Start', 'Slide_Loop', 'Slide_Exit', 'Consume', 'Hit_Knockback'];
const RECIPE = 'tools/build/recipes/brea.mjs';

/** The window of T_Hair_1 the coil shell's UVs use (u0, v0, du, dv), with margin. */
const COIL_CROP = [0.325, 0.42, 0.215, 0.29];

/** Game height of the BODY (soles to crown, not hair or wrap), bible §3.3. */
export const BODY_HEIGHT = 1.72;

/**
 * The dyn_ chains, in the UBC pack's model frame (metres, +Y up, +Z forward,
 * T-pose; the raw body is 1.767 m). Shared with outfit-pan-1.mjs, whose sash
 * strip skins to dyn_sashEnd and so must carry the same joints and binds.
 */
export const CHAINS = {
  hairKnotTail: {
    parent: 'Head',
    names: ['dyn_hairKnotTail_01', 'dyn_hairKnotTail_02', 'dyn_hairKnotTail_03', 'dyn_hairKnotTail_04', 'dyn_hairKnotTail_end'],
    // from under the topknot, down the back of the skull: 0.22 m
    points: [[0, 1.738, -0.128], [0, 1.688, -0.145], [0, 1.637, -0.150], [0, 1.585, -0.148], [0, 1.528, -0.142]],
  },
  wrapSash: {
    parent: 'Head',
    names: ['dyn_wrapSash_01', 'dyn_wrapSash_02', 'dyn_wrapSash_03', 'dyn_wrapSash_04', 'dyn_wrapSash_05', 'dyn_wrapSash_06', 'dyn_wrapSash_end'],
    // from the wrap knot at the back-LEFT of the head (+x is her left), down
    // and OUT to the left-rear, never on the draw side: 0.53 m. Fix round 1
    // (V-brea-one-glance cue 2): the first cut lay flat down the spine inside
    // the body's outline at 64 px; the tail now stands off the nape and the
    // left shoulder blade (the cloth's own stiffness, kept by the spring rest),
    // so it fills the left neck notch from behind and trails behind the nape
    // from the side
    points: [[0.052, 1.678, -0.116], [0.085, 1.615, -0.175], [0.110, 1.548, -0.222], [0.128, 1.478, -0.258],
      [0.140, 1.405, -0.282], [0.148, 1.330, -0.296], [0.152, 1.255, -0.302]],
  },
  sashEnd: {
    parent: 'pelvis',
    names: ['dyn_sashEnd_01', 'dyn_sashEnd_02', 'dyn_sashEnd_03', 'dyn_sashEnd_end'],
    // the linen sash knot at the left hip, hanging 0.24 m
    points: [[0.162, 0.985, 0.060], [0.172, 0.905, 0.066], [0.178, 0.825, 0.066], [0.181, 0.745, 0.062]],
  },
  alidadeCord: {
    parent: 'spine_03',
    names: ['dyn_alidadeCord_01', 'dyn_alidadeCord_02', 'dyn_alidadeCord_end'],
    // neck cord to the sternum, outside the smock
    points: [[0, 1.452, 0.080], [0, 1.385, 0.142], [0, 1.322, 0.163]],
  },
};

/** Face bumps in GAME millimetres (bible §3.5), turned into raw-unit bumps below. */
const FACE_MM = {
  noseBridge: { d: [0, 0.4, 6.4], s: 0.013 },
  noseTip: { d: [0, -2.4, 7.0], s: 0.013 },
  cheek: { d: [6.0, 0.0, 3.0], s: 0.016 },     // mirrored for the right side
  jaw: { d: [6.8, -1.6, 0.0], s: 0.017 },      // mirrored
  chin: { d: [0, -3.2, 5.6], s: 0.014 },
  brow: { d: [0, 0.6, 4.2], s: 0.016 },
  upperLip: { d: [0, 0.0, -2.0], s: 0.008 },
};

export async function build({ out = ROOT } = {}) {
  const SRC = srcRoot();
  const clips = await buildClips(SRC, out);
  const base = await readGltf(path.join(UBC_DIR(SRC), 'Superhero_Female_FullBody.gltf'));
  cleanDoc(base);
  const root = base.getRoot();
  nodeByName(base, 'Superhero_Female').setName('Brea_Body');
  nodeByName(base, 'Eyebrows').setName('Brea_Brows');
  const bodyNode = nodeByName(base, 'Brea_Body');
  const eyesNode = nodeByName(base, 'Eyes');
  const browNode = nodeByName(base, 'Brea_Brows');
  const bodyPrim = bodyNode.getMesh().listPrimitives()[0];
  const eyesPrim = eyesNode.getMesh().listPrimitives()[0];
  const browPrim = browNode.getMesh().listPrimitives()[0];

  // ---- raw measurements (bind, model frame)
  const bodyBox = bboxOf(bodyPrim);
  const rawBodyH = bodyBox.max[1] - bodyBox.min[1];
  const S = BODY_HEIGHT / rawBodyH;            // raw -> game metres (uniform, applied by assets.normalize)
  const mm = (v) => v / 1000 / S;              // game mm -> raw metres

  const joints = root.listSkins()[0].listJoints().map((j) => j.getName());
  const headSet = new Set(['Head', 'neck_01'].map((n) => joints.indexOf(n)));
  const headW = vertexWeightOf(bodyPrim, headSet);
  const headPts = [];
  {
    const P = bodyPrim.getAttribute('POSITION'), p = [0, 0, 0];
    for (let i = 0; i < P.getCount(); i++) { P.getElement(i, p); if (headW[i] > 0.5 && p[1] > 1.45) headPts.push([p[0], p[1], p[2], i]); }
  }
  const eyes = eyeCentres(eyesPrim);
  const L = findLandmarks(headPts, eyes);
  for (const k of Object.keys(L)) if (!L[k]) throw new Error(`landmark ${k} not found`);

  // ---- the face field
  const bumps = [];
  const B = (at, d, s) => bumps.push({ at, d: d.map(mm), s: s / S });
  B(L.noseBridge, FACE_MM.noseBridge.d, FACE_MM.noseBridge.s);
  B(L.noseTip, FACE_MM.noseTip.d, FACE_MM.noseTip.s);
  B(L.cheekL, FACE_MM.cheek.d, FACE_MM.cheek.s);
  B(L.cheekR, [-FACE_MM.cheek.d[0], FACE_MM.cheek.d[1], FACE_MM.cheek.d[2]], FACE_MM.cheek.s);
  B(L.jawL, FACE_MM.jaw.d, FACE_MM.jaw.s);
  B(L.jawR, [-FACE_MM.jaw.d[0], FACE_MM.jaw.d[1], FACE_MM.jaw.d[2]], FACE_MM.jaw.s);
  B(L.chin, FACE_MM.chin.d, FACE_MM.chin.s);
  B(L.brow, FACE_MM.brow.d, FACE_MM.brow.s);
  // the brow ridge runs across both brows, not only the glabella
  B([L.brow[0] + 0.032, L.brow[1] - 0.004, L.brow[2] - 0.016], [0.6, 0.4, 3.4], 0.014);
  B([L.brow[0] - 0.032, L.brow[1] - 0.004, L.brow[2] - 0.016], [-0.6, 0.4, 3.4], 0.014);
  B(L.upperLip, FACE_MM.upperLip.d, FACE_MM.upperLip.s);
  // head-only region: nothing below the jaw line or behind the ears moves
  const region = (p) => smooth(1.47, 1.505, p[1]) * smooth(-0.075, -0.02, p[2]);
  const field = faceField(bumps, { rigid: eyes, r0: mm(15), r1: mm(33), region });   // the eye ball reaches ~14 mm from its centre: rigid to 15, 18 mm falloff

  // stock profile + landmarks BEFORE the field (the gate's reference)
  const WIN = { y0: L.chin[1] - 0.03, y1: L.brow[1] + 0.035, z0: (eyes[0][2] + eyes[1][2]) / 2 - 0.02, z1: L.noseTip[2] + 0.03 };
  const PX = 0.0005;
  const headTri = (a, b, c) => headW[a] > 0.5 || headW[b] > 0.5 || headW[c] > 0.5;
  const stockProfile = profileMask(bodyPrim, WIN, PX, headTri);
  const stockPos = new Float32Array(bodyPrim.getAttribute('POSITION').getArray());

  applyField(bodyPrim, field);
  const moved = movedMask(bodyPrim, stockPos);
  recomputeNormals(bodyPrim, moved);
  applyField(browPrim, field);
  const eyeStock = new Float32Array(eyesPrim.getAttribute('POSITION').getArray());
  applyField(eyesPrim, field);
  let eyeMax = 0;
  { const a = eyesPrim.getAttribute('POSITION').getArray(); for (let i = 0; i < a.length; i += 3) eyeMax = Math.max(eyeMax, Math.hypot(a[i] - eyeStock[i], a[i + 1] - eyeStock[i + 1], a[i + 2] - eyeStock[i + 2])); }

  // measure what the field did at each landmark (game mm), and the profile IoU
  const disp = {};
  const faceRec = { landmarks: {}, graded: GRADED };
  {
    const P = bodyPrim.getAttribute('POSITION'), p = [0, 0, 0];
    for (const k of Object.keys(L)) {
      // the landmark vertex itself: nearest stock vertex to the landmark point
      let bi = -1, bd = 1e9;
      for (let i = 0; i < P.getCount(); i++) {
        const d = (stockPos[i * 3] - L[k][0]) ** 2 + (stockPos[i * 3 + 1] - L[k][1]) ** 2 + (stockPos[i * 3 + 2] - L[k][2]) ** 2;
        if (d < bd) { bd = d; bi = i; }
      }
      P.getElement(bi, p);
      const stock = [stockPos[bi * 3], stockPos[bi * 3 + 1], stockPos[bi * 3 + 2]];
      const d = Math.hypot(p[0] - stock[0], p[1] - stock[1], p[2] - stock[2]) * S * 1000;
      disp[k] = +d.toFixed(2);
      faceRec.landmarks[k] = { stock: stock.map((v) => +v.toFixed(5)), now: p.map((v) => +v.toFixed(5)), deltaMm: disp[k] };
    }
  }
  const nowProfile = profileMask(bodyPrim, WIN, PX, headTri);
  faceRec.window = WIN; faceRec.px = PX;
  faceRec.stockProfile = rle(stockProfile);
  faceRec.iou = +iou(stockProfile, nowProfile).toFixed(4);
  faceRec.eyes = eyes.map((e) => e.map((v) => +v.toFixed(5)));
  faceRec.scale = +S.toFixed(6);
  faceRec.graded6mm = GRADED.filter((k) => disp[k] >= 6).length;
  faceRec.eyeSocketMaxMm = +(eyeMax * S * 1000).toFixed(3);   // the eye mesh's largest move (rigid socket mask)

  // ---- brows: heavy and straight (×1.08 thicker, arch flattened 40 %), cut by the scar
  const scar = { a: [0.041, 1.701], b: [0.031, 1.671] };        // left brow (+x), x/y, raw
  shapeBrows(browPrim, scar);
  // the pack's brows are 1,480 tris of hair cards; at Brea's budget (plan §4.1:
  // body + head + hair + wrap + eyes <= 10 k) a third of that reads the same
  await simplifyPrim(browPrim, 0.36, 0.004);

  // ---- the coil shell (rigid on Head), moved by the same field
  const hairDoc = await readGltf(path.join(HAIR_DIR(SRC), 'Hair_BuzzedFemale.gltf'));
  cleanDoc(hairDoc);
  const hairNodes = graft(base, hairDoc, 'Hair_BuzzedFemale');
  const hairPrim = hairNodes[0].getMesh().listPrimitives()[0];
  applyField(hairPrim, field);

  // ---- chains
  const chainIdx = {};
  for (const [k, c] of Object.entries(CHAINS)) chainIdx[k] = addChain(base, c.names, c.points, c.parent);
  const head = jointIndex(base, 'Head');

  // ---- head surface radius (skull + coil shell) for the band
  const shell = [];
  {
    const add = (prim, pred) => {
      const P = prim.getAttribute('POSITION'), p = [0, 0, 0];
      for (let i = 0; i < P.getCount(); i++) { P.getElement(i, p); if (pred(i, p)) shell.push([p[0], p[1], p[2]]); }
    };
    add(bodyPrim, (i, p) => headW[i] > 0.5 && p[1] > 1.6);
    add(hairPrim, () => true);
  }
  const headC = [0, 0, -0.008];
  const surfaceR = (th, y) => {
    let best = 0;
    const dx = Math.sin(th), dz = Math.cos(th);
    for (const q of shell) {
      if (Math.abs(q[1] - y) > 0.008) continue;
      const rx = q[0] - headC[0], rz = q[2] - headC[2];
      const r = Math.hypot(rx, rz);
      if (r < 1e-4) continue;
      if ((rx * dx + rz * dz) / r < 0.985) continue;
      best = Math.max(best, r);
    }
    return best || 0.08;
  };

  // ---- hair+wrap atlas regions (u0, v0, du, dv), 512²
  const R = {
    coils: [0, 0, 0.5, 1],
    brows: [0.5, 0, 0.5, 0.5],
    violet: [0.5, 0.52, 0.375, 0.48],
    carmine: [0.875, 0.52, 0.125, 0.23],
    violetDeep: [0.875, 0.76, 0.125, 0.24],
  };
  const remapUV = (prim, rect) => {
    const UV = prim.getAttribute('TEXCOORD_0'), u = [0, 0];
    const arr = new Float32Array(UV.getCount() * 2);
    for (let i = 0; i < UV.getCount(); i++) {
      UV.getElement(i, u);
      arr[i * 2] = rect[0] + Math.min(1, Math.max(0, u[0])) * rect[2];
      arr[i * 2 + 1] = rect[1] + Math.min(1, Math.max(0, u[1])) * rect[3];
    }
    UV.setArray(arr);
  };
  // the coil shell only uses a small window of its 2048² texture: crop it into the atlas
  {
    const UV = hairPrim.getAttribute('TEXCOORD_0'), u = [0, 0];
    const arr = new Float32Array(UV.getCount() * 2);
    for (let i = 0; i < UV.getCount(); i++) {
      UV.getElement(i, u);
      arr[i * 2] = R.coils[0] + ((u[0] - COIL_CROP[0]) / COIL_CROP[2]) * R.coils[2];
      arr[i * 2 + 1] = R.coils[1] + ((u[1] - COIL_CROP[1]) / COIL_CROP[3]) * R.coils[3];
    }
    UV.setArray(arr);
  }
  remapUV(browPrim, [0.5, 0, 0.5, 1]);   // brows use the top half of their texture: v 0..0.51 -> atlas 0..0.51

  // ---- procedural wrap pieces (all rigid on Head except the tails)
  const geo = newGeo();
  // the band: 6 cm, higher over the brow, lower at the back (over the occiput)
  const yFront = L.brow[1] + 0.022, yBack = L.brow[1] - 0.038;
  appendGeo(geo, band({
    center: headC, surfaceR, height: 0.060, offset: 0.007, seg: 32, rows: 2, joint: head, uvRect: R.violet, lip: 0.003,
    y0: (th) => yBack + (yFront - yBack) * (0.5 + 0.5 * Math.cos(th)),
  }));
  // a second, narrower band of the wrap crossing over the crown (the wrap's turn)
  appendGeo(geo, band({
    center: headC, surfaceR, height: 0.030, offset: 0.009, seg: 28, rows: 2, joint: head, uvRect: R.violetDeep, lip: 0.002,
    y0: (th) => (yBack + 0.050) + (yFront + 0.016 - yBack - 0.050) * (0.5 + 0.5 * Math.cos(th)),
  }));
  // the topknot: a wrapped bun Ø 14 cm at the crown-back, axis leaning back
  // Fix round 1 (V-brea-one-glance cue 1): Ø 15 cm and leaning back 45 deg, so it
  // stands 6 cm proud of the crown-back in profile at the SAME top height (the
  // row's targetHeight normalises the bbox; the body stays 1.72 m)
  appendGeo(geo, bun([0, 1.7605, -0.100], { rx: 0.074, ry: 0.060, rz: 0.074, seg: 12, rings: 8, joint: head, uvRect: R.violet, ridges: 3, tilt: [0, 0.70, -0.71] }));
  // its carmine binding where it meets the head
  appendGeo(geo, bun([0, 1.738, -0.112], { rx: 0.054, ry: 0.016, rz: 0.052, seg: 12, rings: 3, joint: head, uvRect: R.carmine, ridges: 0, tilt: [0, 0.70, -0.71] }));
  // the wrap knot the tail leaves from, back-left
  const k0 = CHAINS.wrapSash.points[0];
  appendGeo(geo, bun([k0[0] - 0.006, k0[1] + 0.012, k0[2] + 0.014], { rx: 0.026, ry: 0.022, rz: 0.020, seg: 8, rings: 5, joint: head, uvRect: R.violetDeep, ridges: 2 }));
  // the wrap tail: 0.53 x 0.10 m cloth strip, violet out, carmine lining in
  appendGeo(geo, stripAlong(CHAINS.wrapSash.points, chainIdx.wrapSash.slice(0, -1), {
    along: 16, width: (u) => 0.100 * (1 - 0.2 * u), side: [0.92, 0, 0.39], uvFront: R.violet, uvBack: R.carmine, thick: 0.004, curl: 0.06,
  }));
  // the knot tail: a short tuft of coils out of the topknot, lofted tube 0.22 m
  appendGeo(geo, tubeAlong(CHAINS.hairKnotTail.points, chainIdx.hairKnotTail.slice(0, -1), {
    ring: 7, along: 10, radius: (u) => 0.019 * (1 - 0.55 * u) + 0.003, side: [1, 0, 0], uvRect: [0.05, 0.1, 0.4, 0.8], lobes: 3, twist: 20,
  }));
  const wrapPrim = primFromGeo(base, geo);

  // ---- materials + atlases
  const skinMat = root.listMaterials().find((m) => m.getName() === 'MI_Superhero_Female').setName('MI_Brea_Skin');
  const eyeMat = root.listMaterials().find((m) => m.getName() === 'MI_Eyes');
  const browMat = root.listMaterials().find((m) => m.getName() === 'MI_Hair_2');
  const hairMat = hairPrim.getMaterial();
  const wrapMat = browMat.setName('MI_Brea_HairWrap');

  // eyes -> the skin atlas corner [0.75, 0] .. +0.0625
  remapUV(eyesPrim, [0.75, 0, 0.0625, 0.0625]);

  const painted = await paintSkin(bodyPrim, skinMat, eyeMat, { L, eyes, S, scar });
  await hairAtlas(wrapMat, hairMat);

  // ---- hide mask (Pan Whites I covers which body vertices)
  const { panBindTriangles } = await import('./outfit-pan-1.mjs');
  const tris = await panBindTriangles();
  const hide = coverageMask(bodyPrim, tris, 0.08);
  const hideArr = new Uint8Array(bodyPrim.getAttribute('POSITION').getCount());
  for (let i = 0; i < hideArr.length; i++) hideArr[i] = hide[i] ? 1 : 0;
  const buf = root.listBuffers()[0];
  bodyPrim.setAttribute('_HIDEMASK', base.createAccessor().setType('SCALAR').setArray(hideArr).setBuffer(buf));
  eyesPrim.setAttribute('_HIDEMASK', base.createAccessor().setType('SCALAR').setArray(new Uint8Array(eyesPrim.getAttribute('POSITION').getCount())).setBuffer(buf));

  // ---- join: skin = body + eyes; hairwrap = coils + brows + wrap pieces
  eyesPrim.setMaterial(skinMat);
  const skinJoined = joinPrimitives([bodyPrim, eyesPrim]);
  skinJoined.setMaterial(skinMat);
  for (const p of [hairPrim, browPrim, wrapPrim]) p.setMaterial(wrapMat);
  const hairJoined = joinPrimitives([hairPrim, browPrim, wrapPrim]);
  hairJoined.setMaterial(wrapMat);
  const skin = root.listSkins()[0];
  const arm = nodeByName(base, 'Armature');
  for (const n of [bodyNode, eyesNode, browNode, ...hairNodes]) { n.getMesh()?.dispose(); n.dispose(); }
  for (const [name, prim] of [['Brea_Skin', skinJoined], ['Brea_HairWrap', hairJoined]]) {
    const node = base.createNode(name).setMesh(base.createMesh(name).addPrimitive(prim)).setSkin(skin);
    arm.addChild(node);
  }
  for (const m of root.listMaterials()) if (m !== skinMat && m !== wrapMat) m.dispose();
  for (const t of root.listTextures()) if (!t.listParents().some((p) => p.propertyType === 'Material')) t.dispose();

  // ---- heights
  const allBox = bboxOfDoc(base);
  const totalH = allBox.max[1] - allBox.min[1];
  const hidden = hideArr.reduce((s, v) => s + v, 0);
  const file = path.join(out, OUTPUTS[0]);
  const stats = await writeSkinned(base, file, {
    provenance: { recipe: RECIPE, sources: ['ubc-standard', 'brea-generated'], licence: 'CC0-1.0' },
    extras: {
      r5Hero: {
        bodyHeight: BODY_HEIGHT, rawBodyHeight: +rawBodyH.toFixed(5), rawTotalHeight: +totalH.toFixed(5),
        targetHeight: +(BODY_HEIGHT * totalH / rawBodyH).toFixed(5), scale: +S.toFixed(6),
        chains: Object.fromEntries(Object.entries(CHAINS).map(([k, c]) => [k, c.names])),
        hideBits: { 'pan-1': 1 }, hiddenByPan1: hidden,
      },
      r5Face: faceRec,
      r5Paint: painted,
    },
  });
  return { ...stats, face: { deltas: disp, iou: faceRec.iou, graded6mm: faceRec.graded6mm }, targetHeight: +(BODY_HEIGHT * totalH / rawBodyH).toFixed(5), hidden, clips };
}

/** The native UAL2 clip pack (see UAL2_CLIPS). */
async function buildClips(SRC, out) {
  const { existsSync } = await import('node:fs');
  const cand = [path.join(SRC, 'ual2/UAL2_Standard.glb'), path.join(SRC, 'UAL2_Standard.glb')];
  const file = cand.find((f) => existsSync(f));
  if (!file) throw new Error('[brea] UAL2_Standard.glb not found under the sources (ual2/)');
  const { io } = await import('./lib/face.mjs');
  const doc = await (await io()).read(file);
  const root = doc.getRoot();
  for (const a of root.listAnimations()) {
    // samplers are children of their animation, not of the root: an orphaned
    // sampler still holds its accessors and `prune` keeps them (measured 5.9 MB)
    if (!UAL2_CLIPS.includes(a.getName())) {
      for (const smp of a.listSamplers()) smp.dispose();
      for (const ch of a.listChannels()) ch.dispose();
      a.dispose();
      continue;
    }
    for (const ch of a.listChannels()) {
      const pathName = ch.getTargetPath(), node = ch.getTargetNode()?.getName();
      const keep = pathName === 'rotation' || (pathName === 'translation' && node === 'pelvis');
      if (!keep) { const smp = ch.getSampler(); ch.dispose(); if (smp) smp.dispose(); }
    }
  }
  for (const n of root.listNodes()) if (n.getMesh()) { n.getMesh().dispose(); n.setMesh(null); n.setSkin(null); }
  for (const s of root.listSkins()) s.dispose();
  for (const m of root.listMaterials()) m.dispose();
  for (const t of root.listTextures()) t.dispose();
  const { prune, dedup, resample } = await import('@gltf-transform/functions');
  await doc.transform(resample({ tolerance: 1e-4 }), dedup(), prune({ keepLeaves: true }));
  const { checkProvenance, GENERATOR } = await import('../lib/glb.mjs');
  const asset = root.getAsset();
  asset.generator = GENERATOR;
  asset.extras = { provenance: checkProvenance({ recipe: RECIPE, sources: ['ual2-standard'], licence: 'CC0-1.0' }), r5Clips: UAL2_CLIPS };
  const bytes = await (await io()).writeBinary(doc);
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const dest = path.join(out, OUTPUTS[1]);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, bytes);
  return { file: OUTPUTS[1], bytes: bytes.byteLength, clips: root.listAnimations().map((a) => a.getName()) };
}

/* ------------------------------------------------------------- helpers */

function bboxOf(prim) {
  const P = prim.getAttribute('POSITION'), p = [0, 0, 0];
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (let i = 0; i < P.getCount(); i++) { P.getElement(i, p); for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); } }
  return { min, max };
}
function bboxOfDoc(doc) {
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const b = bboxOf(p);
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], b.min[k]); max[k] = Math.max(max[k], b.max[k]); }
  }
  return { min, max };
}
function vertexWeightOf(prim, set) {
  const J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
  const out = new Float32Array(J.getCount()); const j = [0, 0, 0, 0], w = [0, 0, 0, 0];
  for (let i = 0; i < J.getCount(); i++) {
    J.getElement(i, j); W.getElement(i, w);
    let s = 0; for (let k = 0; k < 4; k++) if (set.has(j[k])) s += w[k];
    out[i] = s;
  }
  return out;
}
function eyeCentres(prim) {
  const P = prim.getAttribute('POSITION'), p = [0, 0, 0];
  const Lc = [0, 0, 0, 0], Rc = [0, 0, 0, 0];
  for (let i = 0; i < P.getCount(); i++) { P.getElement(i, p); const T = p[0] > 0 ? Lc : Rc; T[0] += p[0]; T[1] += p[1]; T[2] += p[2]; T[3]++; }
  return [Lc, Rc].map((c) => [c[0] / c[3], c[1] / c[3], c[2] / c[3]]);
}
function movedMask(prim, before) {
  const a = prim.getAttribute('POSITION').getArray();
  const m = new Uint8Array(a.length / 3);
  for (let i = 0; i < m.length; i++) {
    m[i] = Math.abs(a[i * 3] - before[i * 3]) + Math.abs(a[i * 3 + 1] - before[i * 3 + 1]) + Math.abs(a[i * 3 + 2] - before[i * 3 + 2]) > 1e-6 ? 1 : 0;
  }
  return m;
}

/** meshoptimizer simplify on one primitive's index buffer (borders locked). */
async function simplifyPrim(prim, ratio, error) {
  await MeshoptSimplifier.ready;
  const pos = Float32Array.from(prim.getAttribute('POSITION').getArray());
  const idx = Uint32Array.from(prim.getIndices().getArray());
  const target = Math.max(3, Math.floor(idx.length * ratio / 3) * 3);
  const [out] = MeshoptSimplifier.simplify(idx, pos, 3, target, error, ['LockBorder']);
  prim.getIndices().setArray(Uint32Array.from(out));
}

function primFromGeo(doc, g) {
  const buf = doc.getRoot().listBuffers()[0];
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const nrm = new Float32Array(g.nrm);
  for (let i = 0; i < nrm.length; i += 3) { const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1; nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l; }
  return doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(g.pos)))
    .setAttribute('NORMAL', acc('VEC3', nrm))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(g.uv)))
    .setAttribute('JOINTS_0', acc('VEC4', new Uint16Array(g.jnt)))
    .setAttribute('WEIGHTS_0', acc('VEC4', new Float32Array(g.wgt)))
    .setIndices(acc('SCALAR', new Uint32Array(g.idx)));
}

/** Heavy straight brows: thicken ×1.08 about each brow's own centre line and flatten the arch 40 %; cut the scar. */
function shapeBrows(prim, scar) {
  const P = prim.getAttribute('POSITION'), p = [0, 0, 0];
  const n = P.getCount();
  const arr = new Float32Array(n * 3);
  // centre line per side: mean y in 4 mm x-bins
  const bins = new Map();
  for (let i = 0; i < n; i++) { P.getElement(i, p); const k = `${Math.sign(p[0])}:${Math.round(p[0] / 0.004)}`; const b = bins.get(k) || [0, 0]; b[0] += p[1]; b[1]++; bins.set(k, b); }
  let meanY = 0, cnt = 0;
  for (const b of bins.values()) { meanY += b[0]; cnt += b[1]; }
  meanY /= cnt;
  for (let i = 0; i < n; i++) {
    P.getElement(i, p);
    const b = bins.get(`${Math.sign(p[0])}:${Math.round(p[0] / 0.004)}`);
    const cy = b[0] / b[1];
    const flatCy = cy + (meanY + 0.002 - cy) * 0.4;
    arr[i * 3] = p[0];
    arr[i * 3 + 1] = flatCy + (p[1] - cy) * 1.08;
    arr[i * 3 + 2] = p[2] + 0.0006;
  }
  P.setArray(arr);
  // the scar parts the left brow: drop triangles whose centroid is within 2.5 mm of the scar segment (x/y)
  const idx = prim.getIndices().getArray();
  const keep = [];
  const dSeg = (x, y) => {
    const ax = scar.a[0], ay = scar.a[1], bx = scar.b[0], by = scar.b[1];
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    return Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay)));
  };
  for (let t = 0; t < idx.length; t += 3) {
    const cx = (arr[idx[t] * 3] + arr[idx[t + 1] * 3] + arr[idx[t + 2] * 3]) / 3;
    const cy = (arr[idx[t] * 3 + 1] + arr[idx[t + 1] * 3 + 1] + arr[idx[t + 2] * 3 + 1]) / 3;
    if (cx > 0 && dSeg(cx, cy) < 0.0025) continue;
    keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  prim.getIndices().setArray(new Uint32Array(keep));
}

/**
 * Which body vertices sit under the outfit: a ray from the vertex along its
 * normal meets an outfit triangle within `maxD`. Brute force over a uniform
 * grid of the outfit triangles (bind space; a few hundred ms).
 */
function coverageMask(prim, tris, maxD) {
  const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL');
  const n = P.getCount();
  const cell = 0.05;
  const grid = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  const T = tris.length / 9;
  for (let t = 0; t < T; t++) {
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (let k = 0; k < 3; k++) {
      const x = tris[t * 9 + k * 3], y = tris[t * 9 + k * 3 + 1], z = tris[t * 9 + k * 3 + 2];
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); z0 = Math.min(z0, z); x1 = Math.max(x1, x); y1 = Math.max(y1, y); z1 = Math.max(z1, z);
    }
    for (let a = Math.floor(x0 / cell); a <= Math.floor(x1 / cell); a++)
      for (let b = Math.floor(y0 / cell); b <= Math.floor(y1 / cell); b++)
        for (let c = Math.floor(z0 / cell); c <= Math.floor(z1 / cell); c++) {
          const k = key(a, b, c); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(t);
        }
  }
  const out = new Uint8Array(n);
  const p = [0, 0, 0], d = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    P.getElement(i, p); N.getElement(i, d);
    const cand = new Set();
    for (let s = -0.03; s <= maxD + 1e-9; s += cell * 0.25) {
      const x = p[0] + d[0] * s, y = p[1] + d[1] * s, z = p[2] + d[2] * s;
      const list = grid.get(key(Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell)));
      if (list) for (const t of list) cand.add(t);
    }
    for (const t of cand) {
      const hit = rayTri(p, d, tris, t * 9);
      // the MCO leggings sit ON the skin (measured: 75 % of leg hits within 1 cm,
      // a fifth up to 1 cm INSIDE it): a body vertex up to 3 cm outside the
      // outfit surface is the skin poking through it, and is covered too
      if (hit > -0.03 && hit < maxD) { out[i] = 1; break; }
    }
  }
  return out;
}
function rayTri(o, d, a, k) {
  const e1 = [a[k + 3] - a[k], a[k + 4] - a[k + 1], a[k + 5] - a[k + 2]];
  const e2 = [a[k + 6] - a[k], a[k + 7] - a[k + 1], a[k + 8] - a[k + 2]];
  const h = v3.cross(d, e2);
  const det = v3.dot(e1, h);
  if (Math.abs(det) < 1e-12) return -1;
  const f = 1 / det;
  const s = [o[0] - a[k], o[1] - a[k + 1], o[2] - a[k + 2]];
  const u = f * v3.dot(s, h); if (u < 0 || u > 1) return -1;
  const q = v3.cross(s, e1);
  const v = f * v3.dot(d, q); if (v < 0 || u + v > 1) return -1;
  return f * v3.dot(e2, q);
}

/* ---------------------------------------------------------------- paint */

/**
 * The skin atlas (1024² base, 512² normal + ORM): the UBC body texture, retoned
 * to Brea's warm olive-brown, with the paint layer composited from a bind-space
 * position map, and the eye texture packed into the free strip at u 0.75–0.81.
 */
const SCAR_RGB = [186, 146, 126];

async function paintSkin(bodyPrim, skinMat, eyeMat, { L, eyes, S, scar }) {
  const W = 1024;
  const baseTex = skinMat.getBaseColorTexture();
  const src = await sharp(Buffer.from(baseTex.getImage())).resize(W, W, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
  const pm = positionMap(bodyPrim, W, W);
  const px = (x, y) => (y * W + x) * 3;
  // retone: gain that takes the mid-cheek to #8A5A3C
  const target = hex('#8A5A3C');
  const cheek = [L.cheekL[0] - 0.004, L.cheekL[1] - 0.004, L.cheekL[2] + 0.004];
  let acc = [0, 0, 0], n = 0;
  for (let i = 0; i < W * W; i++) {
    const o = i * 3;
    if (Number.isNaN(pm.pos[o])) continue;
    if (Math.hypot(pm.pos[o] - cheek[0], pm.pos[o + 1] - cheek[1], pm.pos[o + 2] - cheek[2]) < 0.014) {
      acc[0] += src[o]; acc[1] += src[o + 1]; acc[2] += src[o + 2]; n++;
    }
  }
  const gain = n ? target.map((t, k) => t / Math.max(1, acc[k] / n)) : [1, 1, 1];
  const out = Buffer.from(src);
  for (let i = 0; i < W * W * 3; i++) out[i] = Math.min(255, Math.round(src[i] * gain[i % 3]));

  const salt = hex('#EDEAE2');
  const eyeY = (eyes[0][1] + eyes[1][1]) / 2;
  const yS = eyeY - 0.024 / S * 0.98;           // a finger's width below the eyes, across the upper nose
  const halfH = 0.004 / S;                      // 8 mm band
  // x, z on the right hand's back (+y normal). Fix round 1 (V24 "∴ visible"):
  // 1 cm dots in a 3.2 cm triangle, in a pale salt-white ink — the first cut's
  // 6 mm dark dots (#2A2228 on #8A5A3C skin) did not read in any draw close-up
  const handDots = [[-0.713, -0.044], [-0.687, -0.060], [-0.687, -0.028]];
  const dotInk = hex('#E9E2D2');
  const stats = { salt: 0, scar: 0, dots: 0, creases: 0 };
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const o = px(x, y);
      const X = pm.pos[o], Y = pm.pos[o + 1], Z = pm.pos[o + 2];
      if (Number.isNaN(X)) continue;
      const nx = pm.nrm[o], ny = pm.nrm[o + 1], nz = pm.nrm[o + 2];
      // --- salt-line: cheek to cheek across the nose bridge, below the eyes; crackled paste
      if (Y > 1.55 && Math.abs(X) < 0.064 && nz > 0.05 && Z > 0.02) {
        const edge = 1 - smooth(halfH * 0.75, halfH * 1.15, Math.abs(Y - yS - 0.004 * (X * X) / 0.004));
        const side = 1 - smooth(0.054, 0.064, Math.abs(X));
        const crack = smooth(0.42, 0.6, noise3(X * 900, Y * 900, Z * 900)) * 0.55 + smooth(0.55, 0.75, noise3(X * 2600, Y * 2600, 3)) * 0.35;
        const a = edge * side * (0.95 - crack * 0.7);
        if (a > 0.01) {
          for (let k = 0; k < 3; k++) out[o + k] = Math.round(out[o + k] * (1 - a) + salt[k] * a);
          stats.salt++;
        }
      }
      // --- brow scar: a pale seam through the left brow (3 cm)
      if (X > 0.015 && Y > 1.64 && nz > 0.1) {
        const t = Math.max(0, Math.min(1, ((X - scar.a[0]) * (scar.b[0] - scar.a[0]) + (Y - scar.a[1]) * (scar.b[1] - scar.a[1]))
          / ((scar.b[0] - scar.a[0]) ** 2 + (scar.b[1] - scar.a[1]) ** 2)));
        const d = Math.hypot(X - (scar.a[0] + t * (scar.b[0] - scar.a[0])), Y - (scar.a[1] + t * (scar.b[1] - scar.a[1])));
        const a = (1 - smooth(0.0009, 0.0022, d)) * 0.85;
        if (a > 0.01) {
          // a pale, desaturated seam (#BA927E), not a red welt: the first cut
          // (skin x1.3 + 18) read orange-red on the face sheet
          const c = SCAR_RGB;
          for (let k = 0; k < 3; k++) out[o + k] = Math.round(out[o + k] * (1 - a) + c[k] * a);
          stats.scar++;
        }
      }
      // --- sun creases at the outer eye corners
      for (const e of eyes) {
        const sx = Math.sign(e[0]);
        const dx = (X - e[0]) * sx, dy = Y - e[1];
        if (dx > 0.018 && dx < 0.034 && Math.abs(dy) < 0.012 && nz > -0.2) {
          const ang = Math.atan2(dy, dx);
          const lines = Math.abs(Math.sin(ang * 9 + 0.4));
          const a = (1 - smooth(0.0, 0.18, lines)) * (1 - smooth(0.026, 0.034, dx)) * 0.28;
          if (a > 0.01) { for (let k = 0; k < 3; k++) out[o + k] = Math.round(out[o + k] * (1 - a * 0.45)); stats.creases++; }
        }
      }
      // --- ∴ on the back of the right hand (T-pose: right hand at -x, back of hand +y)
      if (X < -0.66 && ny > 0.45) {
        for (const [dx, dz] of handDots) {
          const d = Math.hypot(X - dx, Z - dz);
          const a = (1 - smooth(0.0042, 0.0054, d)) * 0.92;
          if (a > 0.01) { for (let k = 0; k < 3; k++) out[o + k] = Math.round(out[o + k] * (1 - a) + dotInk[k] * a); stats.dots++; }
        }
      }
    }
  }
  // --- eyes into the free strip: 64² at (768, 0); iris darkened to #3B2A20
  const eyeImg = await sharp(Buffer.from(eyeMat.getBaseColorTexture().getImage())).resize(64, 64, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
  const iris = hex('#3B2A20');
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const s = (y * 64 + x) * 3, o = px(768 + x, y);
    const r = eyeImg[s], g = eyeImg[s + 1], b = eyeImg[s + 2];
    const lum = (r + g + b) / 765;
    const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    const k = sat > 0.12 && lum < 0.75 ? 1 : 0;
    out[o] = k ? Math.round(iris[0] * (0.6 + lum)) : r;
    out[o + 1] = k ? Math.round(iris[1] * (0.6 + lum)) : g;
    out[o + 2] = k ? Math.round(iris[2] * (0.6 + lum)) : b;
  }
  const baseWebp = await sharp(out, { raw: { width: W, height: W, channels: 3 } }).webp({ quality: 86, effort: 4 }).toBuffer();
  baseTex.setImage(baseWebp).setMimeType('image/webp').setURI('brea-skin-base.webp');

  // normal 512² with the eye normal at (384, 0) 32²
  const nTex = skinMat.getNormalTexture();
  const nBody = await sharp(Buffer.from(nTex.getImage())).resize(512, 512, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
  const nEye = await sharp(Buffer.from(eyeMat.getNormalTexture().getImage())).resize(32, 32).removeAlpha().raw().toBuffer();
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) for (let k = 0; k < 3; k++) nBody[((y) * 512 + 384 + x) * 3 + k] = nEye[(y * 32 + x) * 3 + k];
  nTex.setImage(await sharp(nBody, { raw: { width: 512, height: 512, channels: 3 } }).webp({ quality: 90, effort: 4 }).toBuffer())
    .setMimeType('image/webp').setURI('brea-skin-normal.webp');
  // ORM 512²: R=1, G=roughness (eyes 0.35), B=0
  const rTex = skinMat.getMetallicRoughnessTexture();
  const rough = await sharp(Buffer.from(rTex.getImage())).resize(512, 512).greyscale().raw().toBuffer();
  const orm = Buffer.alloc(512 * 512 * 3);
  for (let i = 0; i < 512 * 512; i++) {
    const x = i % 512, y = Math.floor(i / 512);
    orm[i * 3] = 255;
    orm[i * 3 + 1] = (x >= 384 && x < 416 && y < 32) ? 89 : rough[i];
    orm[i * 3 + 2] = 0;
  }
  rTex.setImage(await sharp(orm, { raw: { width: 512, height: 512, channels: 3 } }).webp({ quality: 90, effort: 4 }).toBuffer())
    .setMimeType('image/webp').setURI('brea-skin-orm.webp');
  skinMat.setRoughnessFactor(1).setMetallicFactor(0).setDoubleSided(false);
  return { gain: gain.map((g) => +g.toFixed(4)), ...stats };
}

/**
 * The hair+wrap atlas, 512²: coils (T_Hair_1, tinted #15110F) on the left half,
 * brows (T_Hair_2 top half, tinted) top-right, then woven orchil cloth
 * (#5A2E66 Orchil Deep), the carmine lining (#A3213A) and a deeper violet.
 */
async function hairAtlas(wrapMat, hairMat) {
  const W = 512;
  const out = Buffer.alloc(W * W * 3);
  const crop = async (img) => {
    const meta = await sharp(Buffer.from(img)).metadata();
    return sharp(Buffer.from(img)).extract({
      left: Math.round(COIL_CROP[0] * meta.width), top: Math.round(COIL_CROP[1] * meta.height),
      width: Math.round(COIL_CROP[2] * meta.width), height: Math.round(COIL_CROP[3] * meta.height),
    }).resize(256, 512, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  };
  const coils = await crop(hairMat.getBaseColorTexture().getImage());
  const brows = await sharp(Buffer.from(wrapMat.getBaseColorTexture().getImage())).resize(256, 512, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const coilC = hex('#15110F');
  const mean = (buf) => { let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i]; return s / buf.length / 255; };
  const mc = mean(coils), mb = mean(brows);
  for (let y = 0; y < W; y++) for (let x = 0; x < 256; x++) {
    const s = (y * 256 + x) * 3, o = (y * W + x) * 3;
    const l = (coils[s] + coils[s + 1] + coils[s + 2]) / 765 / mc;
    for (let k = 0; k < 3; k++) out[o + k] = Math.min(255, Math.round(coilC[k] * l * 1.2));
  }
  for (let y = 0; y < 264; y++) for (let x = 0; x < 256; x++) {
    const s = (Math.min(511, y) * 256 + x) * 3, o = (y * W + 256 + x) * 3;
    const l = (brows[s] + brows[s + 1] + brows[s + 2]) / 765 / mb;
    for (let k = 0; k < 3; k++) out[o + k] = Math.min(255, Math.round(coilC[k] * l * 1.1));
  }
  const violet = hex('#5A2E66'), carmine = hex('#A3213A'), deep = hex('#4A2456');
  for (let y = 264; y < W; y++) for (let x = 256; x < W; x++) {
    const o = (y * W + x) * 3;
    const u = (x - 256) / 256, v = (y - 264) / 248;
    const c = u >= 0.75 ? (v < 0.48 ? carmine : deep) : violet;
    // plain weave: warp/weft ridges + slub noise
    const weave = 0.9 + 0.06 * Math.sin(x * 1.9) * Math.sin(y * 1.9) + 0.05 * (noise3(x * 0.15, y * 0.6, 7) - 0.5);
    for (let k = 0; k < 3; k++) out[o + k] = Math.min(255, Math.max(0, Math.round(c[k] * weave)));
  }
  const baseTex = wrapMat.getBaseColorTexture();
  baseTex.setImage(await sharp(out, { raw: { width: W, height: W, channels: 3 } }).webp({ quality: 88, effort: 4 }).toBuffer())
    .setMimeType('image/webp').setURI('brea-hairwrap-base.webp');
  // normals: coil normal left, brow normal top-right, flat weave for cloth
  const nOut = Buffer.alloc(W * W * 3);
  const nCoil = await crop(hairMat.getNormalTexture().getImage());
  const nBrow = await sharp(Buffer.from(wrapMat.getNormalTexture().getImage())).resize(256, 512, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 3;
    if (x < 256) { const s = (y * 256 + x) * 3; nOut[o] = nCoil[s]; nOut[o + 1] = nCoil[s + 1]; nOut[o + 2] = nCoil[s + 2]; }
    else if (y < 264) { const s = (y * 256 + x - 256) * 3; nOut[o] = nBrow[s]; nOut[o + 1] = nBrow[s + 1]; nOut[o + 2] = nBrow[s + 2]; }
    else { nOut[o] = 128 + Math.round(10 * Math.sin(x * 1.9)); nOut[o + 1] = 128 + Math.round(10 * Math.sin(y * 1.9)); nOut[o + 2] = 250; }
  }
  const nTex = wrapMat.getNormalTexture();
  nTex.setImage(await sharp(nOut, { raw: { width: W, height: W, channels: 3 } }).webp({ quality: 90, effort: 4 }).toBuffer())
    .setMimeType('image/webp').setURI('brea-hairwrap-normal.webp');
  wrapMat.setRoughnessFactor(0.84).setMetallicFactor(0).setDoubleSided(false).setBaseColorFactor([1, 1, 1, 1]);
}
