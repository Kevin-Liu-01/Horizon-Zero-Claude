/**
 * CALIMA — recipe: Brea, the protagonist body (hero-body W0b; rebuilt for the close-up by
 * character-art W1, R54 + R58; bible §3.3–§3.5, §3.8; plan §4.1 "Brea body + head + hair + wrap +
 * eyes ≤ 10 k, ≤ 2 draws"). The construction NPCs reuse (R56): docs/ROUND5-CHARACTER-ART.md.
 *
 *   node tools/build/build-assets.mjs --only hero-body
 *
 * OUTPUT public/models/hero/brea.glb — ONE skeleton (UBC 65 joints + the dyn_ chains below) and
 * exactly TWO skinned meshes:
 *   Brea_Skin      body + eyes on one 1024² skin atlas (lib/skin.mjs: islands re-packed by
 *                  density, the face twice the source's texels, the eyes in their own patch)
 *   Brea_HairWrap  wound cloth, coil cards and lash cards on one alpha-cut,
 *                  double-sided 512² atlas with COLOR_0 (lib/wrap.mjs, lib/hair.mjs)
 *
 * dyn_ chains (the kept spring solver discovers them by name, class by regex):
 *   dyn_hairKnotTail_01..04 + _end   Head      class hair   (A33-hair-bounce)
 *   dyn_wrapSash_01..06 + _end       Head      class cloth  (wrap tail, left-rear)
 *   dyn_sashEnd_01..03 + _end        pelvis    class cloth  (outfit sash, left hip)
 *   dyn_alidadeCord_01..02 + _end    spine_03  fallback     (alidade on the sternum)
 *
 * FACE (bible §3.5, gate A-face-delta): a displacement field (sum of Gaussian bumps at the seven
 * landmarks, found on the mesh) moves head, eyes and the guide shell together; the eye sockets
 * are held rigid. The vertex normals are softened on the open skin, so the terminator does not
 * print the polygons. Then the PAINT layer is composited in 3-D from a bind-space position map:
 * the seamless tone, ray-cast AO + convexity (form), colour zones, pores, creases, lids, brows
 * hair by hair, the coil hairline, the salt paste (#EDEAE2, 8 mm, plates, cracks and thickness),
 * the 3 cm scar through the left brow and the fine ∴ on the back of the right hand. Eyes dark
 * brown #3B2A20; brows heavy and straight.
 *
 * HIDE MASK: every body vertex carries `_HIDEMASK` (uint8). Bit 0 = covered by Pan Whites I
 * (computed against that outfit's bind geometry: a ray along the vertex normal meets the outfit
 * within 8 cm). `src/hero/outfit.js` drops body triangles whose three vertices carry the equipped
 * set's bit, at equip time.
 *
 * extras.r5Hero   { bodyHeight, totalHeight, targetHeight, chains }
 * extras.r5Face   { stock / displaced landmark positions, deltas (game mm), profile window +
 *                   stock profile mask (RLE), IoU }
 *
 * Sources (CC0): Quaternius Universal Base Characters [Standard] (Superhero_Female_FullBody; the
 * Eyebrows and Hair_BuzzedFemale meshes are read as guides and not shipped). Everything else is
 * procedural in this recipe and its libraries.
 */
import path from 'node:path';
import { MeshoptSimplifier } from 'meshoptimizer';
import { joinPrimitives } from '@gltf-transform/functions';
import {
  ROOT, srcRoot, UBC_DIR, HAIR_DIR, readGltf, cleanDoc, nodeByName, graft, addChain, jointIndex,
  findLandmarks, GRADED, faceField, applyField,
  recomputeNormals, refineEdges, smoothNormals, smooth, profileMask, iou, rle, writeSkinned, v3,
} from './lib/face.mjs';
import { relayoutSkinUV, saltPaste, scarSeam, inkDots, eyeOpening, TriGrid, triSoup } from './lib/skin.mjs';
import { WRAP_ATLAS } from './lib/wrap.mjs';
import { woundHeadwrap, joinGeos, paintWrapAtlas } from './lib/wrap-head.mjs';
import { lashCard } from './lib/hair.mjs';
import {
  humanDensity, vertexWeightOf, eyeCentres, eyeFrontZ, movedMask, primFromGeo, browLines, remapEyeUV,
  cullUnderWrap, cullEyeBacks, simplifyHands, compactPrim, scalpCards, paintHumanSkin,
} from './lib/skin-human.mjs';

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
    // Fix round 5 (judge r2, V-brea-one-glance cue 2: "the tail cannot be
    // separated from the stowed bow's upper limb" in the 64 px black fill): the
    // WRAPPED ROOT — the knotted first 0.17 m — leaves the knot out to the
    // LEFT-REAR and nearly level (the old line, rotated 0.55 rad out and 0.35
    // rad back about the knot), stiff in the solver (class 'wrap', rootK 8),
    // and the free strip hangs from it (the lower four links turned 0.40 /
    // 0.25 rad back toward the vertical): in calm air the tail now stands
    // 0.12 m off the side of the head and 0.23 m behind it, outside the bow's
    // limb line, and the trade wind streams the free end out from there
    points: [[0.052, 1.678, -0.116], [0.113, 1.664, -0.184], [0.169, 1.639, -0.243], [0.201, 1.577, -0.284],
      [0.226, 1.510, -0.314], [0.246, 1.439, -0.336], [0.260, 1.366, -0.350]],
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
    // neck cord to the sternum, outside the smock. Fix round 4 (judge r1, V23:
    // "the alidade reads static … a brass fleck at the buckle"; bible §3.1 /
    // §3.5 "at the sternum"): the cord hung the tube 0.157 m under its root,
    // i.e. at the bottom of her ribs once the idle posture settles the chest
    // (tube 1.17 m over her feet, the clavicles at 1.33). It is 0.078 m now,
    // so the tube hangs at mid-sternum (~1.26 m at idle), 2-3 cm proud of the
    // smock (surface z 0.074 / 0.092 at y 1.40 / 1.38, measured on the bind
    // body + Pan Whites I), where the arm swing does not cover it
    points: [[0, 1.452, 0.080], [0, 1.412, 0.106], [0, 1.384, 0.118]],
  },
};

/**
 * Face bumps in GAME millimetres (bible §3.5), turned into raw-unit bumps below.
 * character-art (W1, R54): the same seven landmarks, re-shaped. The W0b field
 * pushed the nose tip 7 mm forward and DOWN with a wide sigma (a blunt, drooping
 * nose) and pulled the chin down into a point; now the bridge rises, the tip lifts
 * and narrows, the alae come in, the chin is broad and square, and the mandible
 * carries one continuous line from the gonion to the chin. Every graded landmark
 * still moves >= 6 mm (A-face-delta); the eye sockets stay rigid.
 */
const FACE_MM = {
  noseBridge: { d: [0, 0.6, 6.4], s: 0.0125 },
  noseTip: { d: [0, 3.2, -3.4], s: 0.0098 },
  cheek: { d: [5.2, 1.4, 3.4], s: 0.0165 },     // mirrored for the right side
  jaw: { d: [6.2, -2.2, 0.6], s: 0.0235 },      // mirrored
  chin: { d: [0, -1.6, 6.2], sx: 0.0175, sy: 0.0125, sz: 0.016 },
  brow: { d: [0, 0.8, 4.4], s: 0.0165 },
  upperLip: { d: [0, 1.2, -1.0], s: 0.0085 },
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
  let headW = vertexWeightOf(bodyPrim, headSet);
  const headPts = [];
  {
    const P = bodyPrim.getAttribute('POSITION'), p = [0, 0, 0];
    for (let i = 0; i < P.getCount(); i++) { P.getElement(i, p); if (headW[i] > 0.5 && p[1] > 1.45) headPts.push([p[0], p[1], p[2], i]); }
  }
  const eyes = eyeCentres(eyesPrim);
  const eyeSphereZ = eyeFrontZ(eyesPrim) - 0.0165;
  const headW2 = (prim, i) => { const p = [0, 0, 0]; prim.getAttribute('POSITION').getElement(i, p); return p[1] > 1.6 && p[2] > 0 && Math.abs(p[0]) < 0.075; };
  const L = findLandmarks(headPts, eyes);
  for (const k of Object.keys(L)) if (!L[k]) throw new Error(`landmark ${k} not found`);

  // ---- the face field
  const bumps = [];
  const B = (at, d, s, ax = null) => bumps.push({ at, d: d.map(mm), s: s / S, ...(ax ? { sx: ax[0] / S, sy: ax[1] / S, sz: ax[2] / S } : {}) });
  const FM = FACE_MM;
  B(L.noseBridge, FM.noseBridge.d, FM.noseBridge.s, [0.0088, 0.019, 0.016]);
  B(L.noseTip, FM.noseTip.d, FM.noseTip.s, [0.0125, 0.0095, 0.012]);
  B(L.cheekL, FM.cheek.d, FM.cheek.s);
  B(L.cheekR, [-FM.cheek.d[0], FM.cheek.d[1], FM.cheek.d[2]], FM.cheek.s);
  B(L.jawL, FM.jaw.d, FM.jaw.s);
  B(L.jawR, [-FM.jaw.d[0], FM.jaw.d[1], FM.jaw.d[2]], FM.jaw.s);
  B(L.chin, FM.chin.d, 0.016, [FM.chin.sx, FM.chin.sy, FM.chin.sz]);
  B(L.brow, FM.brow.d, FM.brow.s);
  // the brow ridge runs across both brows, not only the glabella
  B([L.brow[0] + 0.032, L.brow[1] - 0.004, L.brow[2] - 0.016], [0.6, 0.4, 3.4], 0.014);
  B([L.brow[0] - 0.032, L.brow[1] - 0.004, L.brow[2] - 0.016], [-0.6, 0.4, 3.4], 0.014);
  B(L.upperLip, FM.upperLip.d, FM.upperLip.s);
  // the alae come in with the tip (no blunt ball nose), and the side walls slim toward the bridge
  const ty = L.noseTip[1], tz = L.noseTip[2];
  B([0.0175, ty - 0.003, tz - 0.022], [-3.0, 1.3, -1.0], 0.0088);
  B([-0.0175, ty - 0.003, tz - 0.022], [3.0, 1.3, -1.0], 0.0088);
  B([0.0105, ty + 0.018, tz - 0.024], [-1.2, 0, -0.4], 0.0085);
  B([-0.0105, ty + 0.018, tz - 0.024], [1.2, 0, -0.4], 0.0085);
  // the mandible: one line from the gonion to the chin, a little below the stock edge
  for (const sx of [1, -1]) {
    B([sx * 0.040, L.chin[1] + 0.012, 0.030], [sx * 1.6, -2.4, 0.2], 0.0165);
    B([sx * 0.024, L.chin[1] + 0.004, 0.066], [sx * 1.2, -1.2, 1.2], 0.0135);
  }
  // the neck takes a little more body under the jaw, so the head does not sit on a stalk
  for (const sx of [1, -1]) B([sx * 0.038, 1.50, -0.012], [sx * 6.4, 0, 0.6], 0.026);
  B([0, 1.495, 0.035], [0, 0, 3.2], 0.024);
  // the ears lie closer to the skull, the lobe rounded up (stock stands off and comes to a point)
  for (const sx of [1, -1]) {
    B([sx * 0.0795, 1.655, -0.04], [-sx * 3.2, 0, 0], 0.017);
    B([sx * 0.0735, 1.598, -0.012], [-sx * 3.0, 3.0, 0.4], 0.0075);
  }
  // head-only region: nothing below the jaw line or behind the ears moves
  const region = (p) => smooth(1.425, 1.47, p[1]) * smooth(-0.10, -0.03, p[2]);
  const field = faceField(bumps, { rigid: eyes, r0: mm(15), r1: mm(33), region });   // the eye ball reaches ~14 mm from its centre: rigid to 15, 18 mm falloff

  // stock profile + landmarks BEFORE the field (the gate's reference)
  const WIN = { y0: L.chin[1] - 0.03, y1: L.brow[1] + 0.035, z0: (eyes[0][2] + eyes[1][2]) / 2 - 0.02, z1: L.noseTip[2] + 0.03 };
  const PX = 0.0005;
  const headTri = (a, b, c) => headW[a] > 0.5 || headW[b] > 0.5 || headW[c] > 0.5;
  const stockProfile = profileMask(bodyPrim, WIN, PX, headTri);
  const stockPos = new Float32Array(bodyPrim.getAttribute('POSITION').getArray());

  applyField(bodyPrim, field);
  // her gaze measures: the upper lids come down a little over the iris, the lower ones up a touch
  // (lids only, the sockets are the rigid eye mesh's: A-face-delta reads that)
  {
    const P = bodyPrim.getAttribute('POSITION'), a = P.getArray();
    for (let i = 0; i < P.getCount(); i++) {
      const x = a[i * 3], y = a[i * 3 + 1], z = a[i * 3 + 2];
      const e = eyes[x > 0 ? 0 : 1];
      const dx = (x - e[0]) / 0.0235, dy = y - e[1];
      if (Math.abs(dx) > 1 || z < 0.05 || headW[i] < 0.5) continue;
      const xk = 1 - dx * dx * dx * dx;
      if (dy > 0.0015 && dy < 0.019) {
        const k = xk * (1 - smooth(0.0055, 0.0165, dy));
        a[i * 3 + 1] -= mm(1.25) * k; a[i * 3 + 2] += mm(0.22) * k;
      } else if (dy < -0.0015 && dy > -0.014) {
        const k = xk * (1 - smooth(0.005, 0.0125, -dy));
        a[i * 3 + 1] += mm(0.5) * k;
      }
    }
    P.setArray(a);
  }
  const moved = movedMask(bodyPrim, stockPos);
  recomputeNormals(bodyPrim, moved);
  // the jaw line and the chin are the silhouette a close-up reads: split their long edges on the curve
  const stockN = bodyPrim.getAttribute('POSITION').getCount();
  const refined = refineEdges(bodyPrim, {
    minLen: 0.0066, maxEdges: 260,
    want: (p) => {
      const ax = Math.abs(p[0]);
      if (p[1] < 1.515 || p[1] > 1.625 || ax > 0.082 || p[2] < -0.05) return false;
      // not the mouth or the nose, which carry their own density
      return !(p[1] > 1.565 && ax < 0.03 && p[2] > 0.07);
    },
  });
  headW = vertexWeightOf(bodyPrim, headSet);
  // the face stops printing its polygons on the terminator; lips, lids and nostrils keep their edge
  smoothNormals(bodyPrim, {
    iters: 6,
    weight: (p) => {
      if (p[1] < 1.47 || Math.abs(p[0]) > 0.11) return 0;
      const lid = Math.min(Math.hypot((Math.abs(p[0]) - eyes[0][0]) / 0.024, (p[1] - eyes[0][1]) / 0.0125), 1.6);
      const lip = Math.hypot(p[0] / 0.032, (p[1] - (L.upperLip[1] - 0.011)) / 0.017);
      const nose = Math.hypot(p[0] / 0.022, (p[1] - (L.noseTip[1] - 0.012)) / 0.013);
      const ear = Math.abs(p[0]) > 0.068 && p[2] < 0.03 && p[1] > 1.59 && p[1] < 1.71 ? 0 : 1;
      return smooth(0.85, 1.25, lid) * smooth(0.8, 1.2, lip) * smooth(0.75, 1.15, nose) * ear;
    },
  });
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
      for (let i = 0; i < stockN; i++) {
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

  // ---- the guide meshes: the stock brows and the stock hair shell are read, not shipped
  const scar = { a: [0.0405, 1.699], b: [0.0315, 1.671] };        // left brow (+x), x/y, raw
  const brows = browLines(browPrim);
  const hairDoc = await readGltf(path.join(HAIR_DIR(SRC), 'Hair_BuzzedFemale.gltf'));
  cleanDoc(hairDoc);
  const hairNodes = graft(base, hairDoc, 'Hair_BuzzedFemale');
  const hairPrim = hairNodes[0].getMesh().listPrimitives()[0];
  applyField(hairPrim, field);
  const shellGrid = new TriGrid(new Float32Array(triSoup(hairPrim)), 0.016);

  // ---- chains
  const chainIdx = {};
  for (const [k, c] of Object.entries(CHAINS)) chainIdx[k] = addChain(base, c.names, c.points, c.parent);
  const head = jointIndex(base, 'Head');

  // ---- the wrap: wound cloth on the measured head form (lib/wrap.mjs)
  const skinJ = bodyPrim.getAttribute('JOINTS_0'), skinW = bodyPrim.getAttribute('WEIGHTS_0');
  const isEar = (p) => Math.abs(p[0]) > 0.0735 && p[1] < 1.70 && p[2] < 0.03;
  const headKeep = (() => {
    const P = bodyPrim.getAttribute('POSITION'), p = [0, 0, 0], ear = new Uint8Array(P.getCount());
    for (let i = 0; i < ear.length; i++) { P.getElement(i, p); ear[i] = isEar(p) ? 1 : 0; }
    return (a, b, c) => (headW[a] > 0.5 || headW[b] > 0.5 || headW[c] > 0.5) && !(ear[a] || ear[b] || ear[c]);
  })();
  const headSoup = new Float32Array(triSoup(bodyPrim, headKeep));
  const wrapped = woundHeadwrap({
    headSoup, joint: head, center: [0, 1.672, -0.012],
    // the hair and padding the cloth rides on: thin over the brow, fuller over the crown and the back
    lift: (dx, dy, dz) => 0.0034 + 0.0052 * smooth(0.0, 0.75, dy) + 0.0032 * smooth(0.1, -0.85, dz),
    // the base turn: low edge at +13 deg over the brow, +9 deg over the ears, -27 deg on the nape
    base: { tiltDeg: 20, warpDeg: -7.5, lowDeg: 1.5, w: 0.232 },
    // two turns crossing over the forehead
    turns: [
      { phiDeg: 82, tauDeg: 19, oDeg: 29, w: 0.215, along: 34, lift: 0.0064, pillow: 0.0026, creaseAmp: 0.0012, seed: 8, flip: true },
      { phiDeg: -74, tauDeg: 17, oDeg: 39, w: 0.215, along: 30, lift: 0.0102, pillow: 0.0028, creaseAmp: 0.0012, seed: 15 },
    ],
    // the topknot; its top is the bbox top that assets.specs.js's targetHeight is computed from
    bun: { c: [0, 1.7605, -0.100], axis: [0, 0.70, -0.71], r: 0.0605, topY: 1.82756 },
    knot: CHAINS.wrapSash.points[0],
    // the tail: same width, side, cup and twist as hero-body's strip (A-tail-legible grades it)
    tail: { points: CHAINS.wrapSash.points, joints: chainIdx.wrapSash.slice(0, -1), width: (u) => 0.100 * (1 - 0.2 * u), side: [0.55, 0.65, 0.5], curl: 0.12, twist: Math.PI / 2, gather: 0.42, gatherTo: 0.44, roll: 0.55, fold: 0.0072, along: 18, across: 5 },
    // the other end of the topknot's cloth rides the knot-tail chain (A33-hair-bounce reads the chain): no coil tuft
    tail2: { points: CHAINS.hairKnotTail.points, joints: chainIdx.hairKnotTail.slice(0, -1), width: (u) => 0.040 * (1 - 0.25 * u), side: [1, 0, 0.2], twist: 0.9, curl: 0.14, gather: 0.5 },
  });

  // ---- the skull under the wrap and the backs of the eyes are never seen: they pay for the cloth
  const culled = cullUnderWrap(bodyPrim, wrapped.covers, isEar);
  const eyesCulled = cullEyeBacks(eyesPrim, eyes);
  const handsCut = await simplifyHands(bodyPrim);
  compactPrim(bodyPrim);

  // ---- materials
  const skinMat = root.listMaterials().find((m) => m.getName() === 'MI_Superhero_Female').setName('MI_Brea_Skin');
  const eyeMat = root.listMaterials().find((m) => m.getName() === 'MI_Eyes');
  const browMat = root.listMaterials().find((m) => m.getName() === 'MI_Hair_2');
  const wrapMat = browMat.setName('MI_Brea_HairWrap');

  // ---- the skin atlas: a new layout (the face twice the texels), eyes in their own patch
  const EYE_PX = 160;
  const layout = relayoutSkinUV(bodyPrim, {
    density: humanDensity,
    reserve: [{ id: 'eye', w: EYE_PX / 1024, h: EYE_PX / 1024 }],
    pad: 0.009, elastic: 0.7,
  });
  const eyeR = layout.reserved.eye;
  remapEyeUV(eyesPrim, eyes, eyeR);

  // the eye openings, read off the meshes; lash cards and lid lines follow them
  const eyeTrue = eyes.map((e) => [e[0], e[1], eyeSphereZ]);
  const faceGridSoup = triSoup(bodyPrim, (a, b, c) => headW2(bodyPrim, a) && headW2(bodyPrim, b) && headW2(bodyPrim, c));
  const faceGrid = new TriGrid(new Float32Array(faceGridSoup), 0.006);
  const ballGrid = new TriGrid(new Float32Array(triSoup(eyesPrim)), 0.006);
  const opens = eyeTrue.map((e) => eyeOpening(faceGrid, e, { eyeR: 0.0168, ballGrid }));
  const zAt = (x, y) => { const t = faceGrid.cast(x, y + 0.0004, 0.2, 0, 0, -1, 0.17, 0.0001); return t >= 0 ? 0.2 - t : eyeTrue[0][2] + 0.016; };
  const lashes = [1, -1].map((side, i) => lashCard(opens[i], { side, joint: head, zAt, rect: WRAP_ATLAS.lashes.rect, W: WRAP_ATLAS.W }));

  // her own marks: the salt-line, the scar, the ∴
  const eyeY = (eyes[0][1] + eyes[1][1]) / 2;
  const yS = eyeY - 0.024 / S * 0.98;           // a finger's width below the eyes, across the upper nose
  const { panBindTriangles } = await import('./outfit-pan-1.mjs');
  const panTris = await panBindTriangles();
  const skinImg = await paintHumanSkin({
    bodyPrim, skinMat, layout, eyeR, EYE_PX, L, eyes, brows, shellGrid, opens, scar, names: 'brea',
    occluders: wrapped.soup, collar: panTris,
    marks: [
      saltPaste({
        y: (X) => yS + 0.004 * (X * X) / 0.004,
        half: (X) => (0.0041 / S) * (1 - 0.1 * smooth(0.02, 0.058, Math.abs(X))),
        xMax: 0.059,
      }),
      scarSeam({ a: scar.a, b: scar.b }),
      inkDots({ dots: [[-0.7075, -0.0445], [-0.6895, -0.0555], [-0.6895, -0.0335]], r: 0.00265, where: (T) => T.X < -0.66 && T.ny > 0.4 }),
    ],
  });
  const wrapTex = await paintWrapAtlas(base, wrapMat);

  // ---- hide mask (Pan Whites I covers which body vertices)
  const hide = coverageMask(bodyPrim, panTris, 0.08);
  const hideArr = new Uint8Array(bodyPrim.getAttribute('POSITION').getCount());
  // the collar stands off the neck: a look down inside it meets skin, never a hole through her, so
  // the neck and the top of the chest stay whatever the normal-ray test says
  const insideCollar = (x, y) => y > 1.42 && Math.abs(x) < 0.088;
  {
    const P = bodyPrim.getAttribute('POSITION'), q = [0, 0, 0];
    for (let i = 0; i < hideArr.length; i++) { P.getElement(i, q); hideArr[i] = hide[i] && !insideCollar(q[0], q[1]) ? 1 : 0; }
  }
  const buf = root.listBuffers()[0];
  bodyPrim.setAttribute('_HIDEMASK', base.createAccessor().setType('SCALAR').setArray(hideArr).setBuffer(buf));
  eyesPrim.setAttribute('_HIDEMASK', base.createAccessor().setType('SCALAR').setArray(new Uint8Array(eyesPrim.getAttribute('POSITION').getCount())).setBuffer(buf));

  // ---- the hair + wrap primitive (cloth, cards, locks: one material on the 512² atlas)
  const cards = scalpCards({ bodyPrim, headW, shellGrid, wrapped, skinJ, skinW });
  const hairGeo = joinGeos([wrapped.geo, cards, ...lashes]);
  const wrapPrim = primFromGeo(base, hairGeo);

  // ---- join: skin = body + eyes; hairwrap = one primitive
  eyesPrim.setMaterial(skinMat);
  const skinJoined = joinPrimitives([bodyPrim, eyesPrim]);
  skinJoined.setMaterial(skinMat);
  wrapPrim.setMaterial(wrapMat);
  const skin = root.listSkins()[0];
  const arm = nodeByName(base, 'Armature');
  for (const n of [bodyNode, eyesNode, browNode, ...hairNodes]) { n.getMesh()?.dispose(); n.dispose(); }
  for (const [name, prim] of [['Brea_Skin', skinJoined], ['Brea_HairWrap', wrapPrim]]) {
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
      r5Paint: { ...skinImg.stats, layout: { shrink: +layout.shrink.toFixed(3), eyePatch: eyeR }, culled: { underWrap: culled, eyeBacks: eyesCulled, handsCut } },
    },
  });
  void wrapTex;
  return { ...stats, face: { deltas: disp, iou: faceRec.iou, graded6mm: faceRec.graded6mm }, targetHeight: +(BODY_HEIGHT * totalH / rawBodyH).toFixed(5), hidden, clips, refined, totalTop: +allBox.max[1].toFixed(5), parts: wrapped.parts, cardTris: cards.idx.length / 3, culled, eyesCulled, handsCut };
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
