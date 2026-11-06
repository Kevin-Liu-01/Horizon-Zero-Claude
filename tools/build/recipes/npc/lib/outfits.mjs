/**
 * CALIMA — what each archetype wears (bible §6.1, §6.3; settlements W1). An outfit is a list of MCO
 * parts, each with a dye and a triangle budget, and a function that adds the procedural faction
 * pieces on top of them (hats, aprons, shawls, baskets, tools). Every archetype wears >= 1 procedural
 * faction piece and >= 3 layers (A-npc-fidelity, A-npc-variety).
 *
 * Authored in the pack's female bind frame (lib/pieces.mjs). `ctx` (lib/human.mjs):
 *   ctx.grid()            TriGrid of the body and everything worn so far
 *   ctx.J                 joint index by name; ctx.skinNear(p): weights of the nearest body vertex
 *   ctx.chain(key, parent, points)  a dyn_ chain -> driven joint indices (the `_end` excluded)
 *   ctx.prop(name, parent, at, tip) a prop joint the runtime can collapse -> its index
 *   ctx.add(bucket | list, { dye, hide, shade })  a finished piece
 *   ctx.uv(name)          fn([s, t]) into a swatch of the faction atlas
 *   ctx.rectUV(name)      fn(u, v) over a swatch
 */
import { PAN, HOLDS } from './archetypes.mjs';
import * as P from './pieces.mjs';
import { uvRect } from './atlas.mjs';
import { clothTail } from './kit/wrap.mjs';
import { bun } from './kit/face.mjs';
import { ATLAS } from './atlas.mjs';

const mix = (a, b, t) => a + (b - a) * t;
const panelUV = (name, W = 1024) => ({ rect: ATLAS.sw[name], period: ATLAS.sw[name][2], W, pxPerM: 1 / 0.0016, v: [0, 1] });

/** A knotted sash at the hip with a hanging end on a chain. */
function sashEnd(ctx, { dye, x = 0.162, y = 0.985, z = 0.06, len = 0.3, width = 0.062, key = 'sashEnd' }) {
  const sgn = Math.sign(x) || 1;
  const pts = [[x, y, z], [x + sgn * 0.01, y - len * 0.33, z + 0.006], [x + sgn * 0.016, y - len * 0.66, z + 0.006], [x + sgn * 0.019, y - len, z + 0.002]];
  const j = ctx.chain(key, 'pelvis', pts);
  const R = ATLAS.sw.panelB;
  const tail = clothTail(pts, j, {
    along: 7, across: 2, width: (u) => width * (1 - 0.15 * u), side: [0.35, 0, 0.94], thick: 0.004, curl: 0.05, fold: 0.003, gather: 0.5, gatherTo: 0.22,
    uvFront: { rect: R, period: R[2], W: 1024, pxPerM: 1 / 0.0012, v: [0.05, 0.95] }, uvBack: { rect: R, period: R[2], W: 1024, pxPerM: 1 / 0.0012, v: [0.05, 0.95] },
  });
  ctx.add(tail, { dye });
  const rr = uvRect('panelB');
  ctx.add(bun([x - sgn * 0.004, y + 0.022, z + 0.010], { rx: 0.03, ry: 0.024, rz: 0.022, seg: 8, rings: 5, joint: ctx.J.pelvis, uvRect: rr, ridges: 2 }), { dye });
}

/** The belt at the waist: a band on the surface + a buckle. */
function belt(ctx, { y = 1.03, h = 0.042, dye, buckle = true, swatch = 'leather', brass = '#B08A45', tilt = -0.01 }) {
  const trunk = P.trunkSkin(ctx.J);
  ctx.add(P.ring({ grid: ctx.grid(), y, h, lift: 0.0045, uv: ctx.rectUV(swatch), skin: (p) => trunk(p[1]), tilt }), { dye });
  if (buckle) {
    const z = frontZ(ctx, 0, y) + 0.008;
    ctx.add(P.lathe({ c: [0, y, z], axis: [0, 0, 1], prof: [[0.024, -0.004], [0.026, 0.002], [0.016, 0.006], [0.001, 0.0065]], seg: 8, skin: () => trunk(y), uv: ctx.uvOf('brass') }), { dye: brass });
  }
}

const frontZ = (ctx, x, y) => { const t = ctx.grid().cast(x, y, 0.6, 0, 0, -1, 1.2, 0.0001); return t >= 0 ? 0.6 - t : 0.1; };

/** A bib or waist apron hanging off the trunk; the part below the waist on two dyn_ chains, so each leg moves its own side. */
function apron(ctx, { y0, y1, wTop, wBot, dye, swatch = 'panelA', lift = 0.01, chainKey = 'apron', foldAmp = 0.006, rows = 11, cols = 8, hemWave = 0.008, twoSide = true }) {
  const yHang = Math.min(0.98, y0 - 0.04);
  const zAt = (x, y) => frontZ(ctx, x, y) + lift;
  const X = wBot * 0.55;
  const mk = (s) => {
    const x = s * X * 0.8, z0 = Math.max(zAt(x, yHang), zAt(0, yHang));
    return [[x, yHang, z0], [s * X * 0.9, mix(yHang, y1, 0.33), z0 + 0.006], [s * X, mix(yHang, y1, 0.66), z0 + 0.008], [s * X, y1, z0 + 0.006]];
  };
  const jL = ctx.chain(`${chainKey}L`, 'pelvis', mk(1));
  const jR = ctx.chain(`${chainKey}R`, 'pelvis', mk(-1));
  const trunk = P.trunkSkin(ctx.J);
  const sheet = P.hangingSheet({
    grid: ctx.grid(), rows, cols, y0, y1, halfW: (v) => mix(wTop, wBot, Math.pow(v, 0.7)), side: 1, lift, foldAmp, hemWave, uv: ctx.rectUV(swatch), seed: 3,
    skin: (p, u) => {
      const y = p[1];
      if (y >= yHang) return trunk(y);
      const t = (yHang - y) / Math.max(1e-3, yHang - y1);
      const L = P.chainSkin(jL, t), R = P.chainSkin(jR, t);
      // the sheet's u runs from her right (-x) to her left (+x)
      const c = P.blendSkin(R, L, Math.max(0, Math.min(1, (u - 0.25) * 2)));
      return P.blendSkin(trunk(yHang), c, Math.min(1, t * 2.6));
    },
  });
  ctx.add(twoSide ? P.twoSided(sheet) : sheet, { dye, hide: true });
}

/** A small pouch on the belt, rigid on the pelvis, with its flap as a second lobe. */
function pouch(ctx, { x, y = 0.97, z = 0.06, r = [0.042, 0.052, 0.03], dye, swatch = 'leather' }) {
  const j = ctx.J.pelvis;
  ctx.add(P.sack({ c: [x, y, z], r, uv: ctx.uvOf(swatch), skin: P.rigid(j), seg: 8, rows: 6 }), { dye });
  ctx.add(P.sack({ c: [x, y + r[1] * 0.62, z + r[2] * 0.42], r: [r[0] * 0.92, r[1] * 0.42, r[2] * 0.62], uv: ctx.uvOf(swatch), skin: P.rigid(j), seg: 8, rows: 4 }), { dye, shade: 0.8 });
}

/** A squat pot on a rope at the hip (the caulker's tar). */
function pot(ctx, { x, y, z, dye, rim }) {
  const j = ctx.J.pelvis;
  ctx.add(P.lathe({ c: [x, y, z], prof: [[0.002, -0.06], [0.04, -0.058], [0.052, -0.02], [0.05, 0.02], [0.042, 0.04], [0.046, 0.046], [0.03, 0.04], [0.002, 0.03]], seg: 10, skin: P.rigid(j), uv: ctx.uvOf('iron') }), { dye });
  ctx.add(P.tube([[x, y + 0.045, z + 0.044], [x + 0.03, y + 0.1, z + 0.01], [x, y + 0.11, z - 0.02], [x - 0.03, y + 0.1, z + 0.01], [x, y + 0.045, z - 0.044]], { r: () => 0.0035, ring: 4, along: 6, skin: P.rigid(j), uv: (u, v) => ctx.uvOf('rope')([u, v]) }), { dye: rim });
}

/** An apron string round the waist, tied behind. */
function waistTie(ctx, { y, dye, h = 0.022 }) {
  const trunk = P.trunkSkin(ctx.J);
  ctx.add(P.ring({ grid: ctx.grid(), y, h, lift: 0.0035, uv: ctx.rectUV('linen'), skin: (p) => trunk(p[1]) }), { dye });
}

/** A rolled cuff at both sleeve ends. */
function cuffs(ctx, geo, xCut, dye) {
  for (const s of [1, -1]) {
    const c = P.cuff({ geo, sgn: s, xCut, uv: ctx.uvOf('linen') });
    if (c) ctx.add(c, { dye });
  }
}

/* ================================================================= outfits */

export const OUTFITS = {
  /* 1 — Salt Raker: raker's whites, a plaited palm hat, a salt-crusted waist apron, the rake */
  raker: {
    parts: [
      { part: 'Female_Peasant_Body', dye: PAN.linen, target: 1900 },
      { part: 'Female_Peasant_Arms', dye: PAN.linenDirty, cutX: 0.40, target: 1000, cuff: PAN.linenDirty },
      { part: 'Female_Peasant_Legs', dye: PAN.basalt, target: 1500 },
      { part: 'Female_Peasant_Feet', dye: PAN.esparto, target: 1500 },
    ],
    pieces(ctx) {
      belt(ctx, { y: 1.05, dye: PAN.orchilDeep, swatch: 'linen', buckle: false, h: 0.05 });
      sashEnd(ctx, { dye: PAN.orchilDeep, y: 1.03 });
      apron(ctx, { y0: 1.02, y1: 0.58, wTop: 0.15, wBot: 0.2, dye: PAN.salt, swatch: 'panelC', chainKey: 'apron', rows: 9, cols: 11, foldAmp: 0.0085 });
      pouch(ctx, { x: -0.185, y: 0.985, z: 0.04, dye: PAN.leather });
      const head = ctx.J.Head;
      const [top, under] = P.palmHat({ joint: head, uv: ctx.uvOf('palm') });
      ctx.add(top, { dye: PAN.palm, noHide: true }); ctx.add(under, { dye: PAN.palm, noHide: true });
      // the rake: slung across her back while she walks, in her right hand while she rakes
      const back = ctx.prop('prop_back', 'spine_03', [0, 1.3, -0.15], [0.12, 1.6, -0.17]);
      for (const g of P.rake({ at: [0, 1.3, -0.165], dir: [0.34, 1, -0.03], joint: back, uvWood: ctx.uvOf('wood'), uvTooth: ctx.uvOf('wood'), L: 1.55 })) ctx.add(g, { dye: PAN.wood, noHide: true, prop: 'prop_back' });
      const pr = ctx.palm('r');
      const hand = ctx.prop('prop_hand', 'hand_r', pr, [pr[0], pr[1], pr[2] + 0.18]);
      for (const g of P.rake({ at: pr, dir: [0.02, -0.08, 1], joint: hand, uvWood: ctx.uvOf('wood'), uvTooth: ctx.uvOf('wood'), L: 1.55 })) ctx.add(g, { dye: PAN.wood, noHide: true, prop: 'prop_hand' });
    },
  },

  /* 2 — Guild Matron: orchil heavy, a long skirt, a shawl with a carmine edge, the brass guild chain */
  matron: {
    legsHidden: 1.0,
    parts: [
      { part: 'Female_Peasant_Body', dye: PAN.orchil, target: 1900 },
      { part: 'Female_Peasant_Arms', dye: PAN.orchilDeep, target: 3000, cutX: 0.615, cuff: PAN.carmine },
      { part: 'Female_Peasant_Feet', dye: PAN.leather, target: 1500, cutTop: 0.2 },
    ],
    pieces(ctx) {
      ctx.add(P.skirt({ grid: ctx.grid(), J: ctx.J, y0: 1.1, y1: 0.09, rHem: 0.3, uv: ctx.rectUV('panelA'), rows: 8, seg: 24, rFloor: 0.175, amp: 0.012 }), { dye: PAN.orchilNight, hide: true, shade: 0.9 });
      belt(ctx, { y: 1.09, dye: PAN.leather, h: 0.05 });
      const shawl = P.capelet({ grid: ctx.grid(), skinNear: ctx.skinNear, uv: ctx.rectUV('panelC'), rows: 7, seg: 28, phiFB: -36, phiSide: 22 });
      ctx.add(shawl, { dye: PAN.orchilDeep, hide: true });
      // the two shawl ends hang down her front on chains
      for (const [key, s] of [['shawlEndL', 1], ['shawlEndR', -1]]) {
        const x = s * 0.09, y = 1.34, z = frontZ(ctx, x, y) + 0.022;
        const pts = [[x, y, z], [x + s * 0.008, y - 0.1, z + 0.008], [x + s * 0.012, y - 0.2, z + 0.012], [x + s * 0.012, y - 0.31, z + 0.012]];
        const j = ctx.chain(key, 'spine_03', pts);
        const r = ATLAS.sw.panelC;
        ctx.add(clothTail(pts, j, { along: 7, across: 2, width: (u) => 0.09 * (1 - 0.3 * u), side: [1, 0, 0.1], thick: 0.004, curl: 0.06, fold: 0.004, gather: 0.55, gatherTo: 0.24,
          uvFront: { rect: r, period: r[2], W: 1024, pxPerM: 1 / 0.0016, v: [0, 1] }, uvBack: { rect: r, period: r[2], W: 1024, pxPerM: 1 / 0.0016, v: [0, 1] } }), { dye: PAN.orchilDeep });
      }
      const mid = [0, 1.235, frontZ(ctx, 0, 1.25) + 0.012];
      const mj = ctx.chain('medal', 'spine_03', [[0, 1.3, frontZ(ctx, 0, 1.3) + 0.012], mid, [0, 1.2, mid[2] + 0.002]]);
      const [chain, medal] = P.guildChain({ grid: ctx.grid(), skinNear: ctx.skinNear, y: 1.39, uv: ctx.uvOf('brass'), medalJoints: [mj[mj.length - 1]], medalAt: mid });
      ctx.add(chain, { dye: PAN.brass }); ctx.add(medal, { dye: PAN.brass });
    },
  },

  /* 3 — Salt Porter: rolled sleeves, an open vest, the salt basket on his shoulder */
  porter: {
    vNeck: true,
    parts: [
      { part: 'Male_Peasant_Body', dye: PAN.linen, target: 3400, cutX: 0.345, collar: { y0: 1.44, push: 0.012 } },
      { part: 'Male_Peasant_Arms', dye: PAN.linenDirty, target: 900, cutX: 0.36, cuff: PAN.linenDirty, dropMat: /Regular/ },
      { part: 'Male_Peasant_Legs', dye: PAN.basalt, target: 1000 },
      { part: 'Male_Peasant_Feet', dye: PAN.esparto, target: 1400 },
    ],
    pieces(ctx) {
      belt(ctx, { y: 1.025, dye: PAN.leather });
      sashEnd(ctx, { dye: PAN.carmine, x: 0.17, y: 1.0, z: 0.05 });
      pouch(ctx, { x: -0.19, y: 0.965, z: 0.03, r: [0.05, 0.06, 0.034], dye: PAN.leather });
      // the basket rides his right shoulder; the arm comes up and steadies it (the pose: extras.r5Npc.armPose)
      const sh = ctx.prop('prop_shoulder', 'clavicle_r', [-0.17, 1.45, -0.03], [-0.17, 1.6, -0.03]);
      const parts = P.basket({ c: [-0.245, 1.487, -0.045], axis: [-0.2, 1, -0.06], rBot: 0.085, rTop: 0.135, h: 0.19, joint: sh, uvWicker: ctx.uvOf('wicker'), uvRim: ctx.uvOf('rope'), uvFill: ctx.uvOf('salt'), fillH: 0.05 });
      ctx.armPose({ side: 'r', hand: [-0.325, 1.545, 0.075], pole: [-0.55, -1, 0.1] });
      ctx.add(parts[0], { dye: PAN.esparto, noHide: true }); ctx.add(parts[1], { dye: PAN.esparto, noHide: true }); ctx.add(parts[2], { dye: PAN.esparto, noHide: true }); ctx.add(parts[3], { dye: PAN.salt, noHide: true });
    },
  },

  /* 4 — Boat-Caulker: tar on everything, a short leather apron, the mallet */
  caulker: {
    vNeck: true,
    parts: [
      { part: 'Male_Peasant_Body', dye: PAN.linenDirty, target: 3400, shade: 0.72, cutX: 0.345, collar: { y0: 1.44, push: 0.012 } },
      { part: 'Male_Peasant_Arms', dye: PAN.basalt, target: 900, cutX: 0.36, cuff: PAN.basalt, dropMat: /Regular/ },
      { part: 'Male_Peasant_Legs', dye: PAN.tar, target: 1000, shade: 1.6 },
      { part: 'Male_Peasant_Feet', dye: PAN.leather, target: 1400 },
    ],
    pieces(ctx) {
      belt(ctx, { y: 1.03, dye: PAN.lapilli, swatch: 'rope', buckle: false });
      apron(ctx, { y0: 1.06, y1: 0.62, wTop: 0.17, wBot: 0.22, dye: PAN.leather, swatch: 'leather', lift: 0.012, chainKey: 'apron', foldAmp: 0.003, hemWave: 0.004, rows: 8, cols: 6 });
      waistTie(ctx, { y: 1.065, dye: PAN.lapilli });
      pot(ctx, { x: -0.215, y: 0.93, z: 0.0, dye: PAN.tar, rim: PAN.esparto });
      const hip = ctx.prop('prop_hip', 'pelvis', [0.2, 0.98, 0.0], [0.2, 0.8, 0.0]);
      for (const g of P.hammer({ at: [0.205, 0.98, 0.01], dir: [0, -1, 0.03], joint: hip, uvWood: ctx.uvOf('wood'), uvHead: ctx.uvOf('wood'), L: 0.3, headW: 0.1, headH: 0.07 })) ctx.add(g, { dye: PAN.wood, noHide: true, prop: 'prop_hip' });
      const pr = ctx.palm('r');
      const hand = ctx.prop('prop_hand', 'hand_r', pr, [pr[0], pr[1], pr[2] + 0.18]);
      for (const g of P.hammer({ at: pr, dir: [0.02, -0.05, 1], joint: hand, uvWood: ctx.uvOf('wood'), uvHead: ctx.uvOf('wood'), L: 0.3, headW: 0.1, headH: 0.07 })) ctx.add(g, { dye: PAN.wood, noHide: true, prop: 'prop_hand' });
    },
  },

  /* 5 — Lantern-Keeper: the orchil night cloak on two chains, a hood, a long dark skirt, cane + lantern */
  keeper: {
    legsHidden: 1.0,
    parts: [
      { part: 'Female_Peasant_Body', dye: '#3A3638', target: 1700, shade: 1.0 },   // a worn charcoal bodice: the night cloak and hood carry the orchil, and she never wears Brea's colours
      { part: 'Female_Peasant_Arms', dye: PAN.orchilNight, target: 3400, cutX: 0.615, cuff: PAN.orchilDeep },
      { part: 'Female_Peasant_Feet', dye: PAN.leather, target: 1500, cutTop: 0.2 },
      { part: 'Female_Ranger_Head_Hood', dye: PAN.orchilNight, target: 1500, swatch: 'felt', noHideOnBody: true, shade: 1.2 },
    ],
    pieces(ctx) {
      ctx.add(P.skirt({ grid: ctx.grid(), J: ctx.J, y0: 1.1, y1: 0.08, rHem: 0.29, uv: ctx.rectUV('panelA'), rows: 8, seg: 28, rFloor: 0.18, amp: 0.009 }), { dye: PAN.lapilli, hide: true, shade: 1.3 });
      belt(ctx, { y: 1.08, dye: PAN.lapilli, swatch: 'rope', buckle: false, h: 0.024 });
      pouch(ctx, { x: 0.19, y: 1.0, z: 0.05, r: [0.036, 0.046, 0.026], dye: PAN.leather });
      // the cloak: two chains from the shoulder blades, cloth between them
      const trunk = P.trunkSkin(ctx.J);
      const yTop = 1.42, yHem = 0.2, zb = -0.16;
      const chainL = ctx.chain('cloakL', 'pelvis', [[0.13, 1.36, zb], [0.15, 1.07, zb - 0.03], [0.17, 0.74, zb - 0.05], [0.18, 0.42, zb - 0.055], [0.19, yHem, zb - 0.05]]);
      const chainR = ctx.chain('cloakR', 'pelvis', [[-0.13, 1.36, zb], [-0.15, 1.07, zb - 0.03], [-0.17, 0.74, zb - 0.05], [-0.18, 0.42, zb - 0.055], [-0.19, yHem, zb - 0.05]]);
      const sheet = P.hangingSheet({
        grid: ctx.grid(), rows: 12, cols: 8, y0: yTop, y1: yHem, side: -1, lift: 0.018, halfW: (v) => mix(0.21, 0.36, Math.pow(v, 0.8)), uv: ctx.rectUV('panelC'), foldAmp: 0.012, foldN: 2.6, seed: 9, cling: 0.05,
        skin: (p, u, v) => {
          const t = Math.max(0, (1.36 - p[1]) / (1.36 - yHem));
          const L = P.chainSkin(chainL, t), R = P.chainSkin(chainR, t);
          const c = P.blendSkin(R, L, Math.min(1, Math.max(0, u)));
          return v < 0.08 ? trunk(p[1]) : P.blendSkin(trunk(1.36), c, Math.min(1, t * 3));
        },
      });
      ctx.add(P.twoSided(sheet, { inset: 0.003, shade: 0.5 }), { dye: PAN.orchilNight, shade: 1.25 });
      // a brass cloak pin at the throat
      const zz = frontZ(ctx, 0, 1.39) + 0.012;
      ctx.add(P.lathe({ c: [0, 1.39, zz], axis: [0, 0.1, 1], prof: [[0.016, -0.003], [0.018, 0.002], [0.012, 0.0055], [0.001, 0.006]], seg: 8, skin: P.rigid(ctx.J.spine_03), uv: ctx.uvOf('brass') }), { dye: PAN.brass });
      // the cane in her right hand; the lantern, shown at night or while she keeps watch
      const pr = ctx.palm('r');
      const hand = ctx.prop('prop_hand', 'hand_r', pr, [pr[0] - 0.08, pr[1], pr[2]]);
      // the cane's axis: straight down at the middle of the walk's arm swing (read off the clip: F|Walk_Loop, hand_r)
      for (const g of P.cane({ at: pr, dir: [-0.817, -0.176, -0.548], joint: hand, uvWood: ctx.uvOf('wood'), uvTip: ctx.uvOf('brass'), L: 0.86 })) ctx.add(g, { dye: PAN.wood, noHide: true, prop: 'prop_hand' });
      // the lantern: hangs from the right fist in Idle_Lantern_Loop (its axis read off the clip)
      const lamp = ctx.prop('prop_lamp', 'hand_r', pr, [pr[0] + 0.015, pr[1] - 0.19, pr[2] - 0.006]);
      const L = P.lantern({ at: [pr[0], pr[1] - 0.02, pr[2]], axis: [0.074, -0.997, -0.032], joint: lamp, uvBrass: ctx.uvOf('brass'), uvGlass: ctx.uvOf('salt') });
      L.forEach((g, i) => ctx.add(g, { dye: i === 1 ? '#D8C690' : PAN.brass, noHide: true, prop: 'prop_lamp' }));
    },
  },

  /* 6 — Pit Farmer: ash wool, a leather belt with pouches, the back basket */
  farmer: {
    parts: [
      { part: 'Male_Ranger_Body', dye: HOLDS.rust, target: 2900, collar: { y0: 1.44, push: 0.014 } },
      { part: 'Male_Ranger_Body_Belt', from: 'Male_Ranger_Body', meshes: /Belt/, dye: HOLDS.leather, target: 600 },
      { part: 'Male_Ranger_Arms', dye: HOLDS.woolDark, target: 1300, dropMat: /Regular/, cutX: 0.665, cuff: HOLDS.rustDeep },
      { part: 'Male_Ranger_Legs', dye: HOLDS.lapilli, target: 900, shade: 1.5 },
      { part: 'Male_Ranger_Feet_Boots', dye: HOLDS.leather, target: 1500 },
    ],
    pieces(ctx) {
      const back = ctx.prop('prop_back', 'spine_03', [0, 1.28, -0.16], [0, 1.5, -0.16]);
      const parts = P.basket({ c: [0, 1.06, -0.205], axis: [0, 1, -0.06], rBot: 0.1, rTop: 0.17, h: 0.36, joint: back, uvWicker: ctx.uvOf('wicker'), uvRim: ctx.uvOf('rope') });
      for (const g of parts) ctx.add(g, { dye: HOLDS.wicker, noHide: true });
      for (const s of [1, -1]) {
        ctx.add(P.strap([[s * 0.1, 1.48, 0.0], [s * 0.15, 1.44, 0.1], [s * 0.15, 1.28, 0.12], [s * 0.13, 1.14, 0.09]], { grid: ctx.grid(), width: 0.032, lift: 0.006, uv: ctx.rectUV('leather'), skinNear: ctx.skinNear, along: 8 }), { dye: HOLDS.leatherDark });
        ctx.add(P.strap([[s * 0.1, 1.48, 0.0], [s * 0.13, 1.42, -0.1], [s * 0.1, 1.28, -0.13]], { grid: ctx.grid(), width: 0.032, lift: 0.006, uv: ctx.rectUV('leather'), skinNear: ctx.skinNear, along: 5, normalAt: (p) => [0, 0.3, -1] }), { dye: HOLDS.leatherDark });
      }
      sashEnd(ctx, { dye: HOLDS.olive, x: -0.17, y: 1.0, z: 0.05, len: 0.26 });
    },
  },

  /* 7 — Tiller-Follower: a long loose wool tunic over trousers, light wraps, the seed bag on its strap */
  follower: {
    parts: [
      { part: 'Male_Ranger_Arms', dye: HOLDS.wool, target: 1500, dropMat: /Regular/, cutX: 0.665, cuff: HOLDS.wool },
      { part: 'Male_Ranger_Legs', dye: HOLDS.woolDark, target: 900 },
      { part: 'Male_Ranger_Feet_Boots', dye: HOLDS.leather, target: 1500 },
    ],
    legsHiddenFrom: 0.62,
    pieces(ctx) {
      // the tunic: shoulders to mid-thigh, full, no form
      ctx.add(P.capelet({ grid: ctx.grid(), skinNear: ctx.skinNear, uv: ctx.rectUV('panelC'), rows: 6, seg: 26, phi0: 66, phiFB: 8, phiSide: 24, lift: 0.012 }), { dye: HOLDS.wool, hide: true });
      ctx.add(P.skirt({ grid: ctx.grid(), J: ctx.J, y0: 1.37, y1: 0.68, rHem: 0.25, uv: ctx.rectUV('panelA'), rows: 10, seg: 26, rFloor: 0.17, rMax: 0.235, amp: 0.008, lift: 0.015, follow: 0.26, cz: -0.015, pleats: 6 }), { dye: HOLDS.wool, hide: true });
      belt(ctx, { y: 1.02, dye: HOLDS.rust, swatch: 'rope', buckle: false, h: 0.03 });
      // the bag at the left hip on a chain, its strap over the right shoulder
      const pts = [[0.2, 0.98, 0.05], [0.215, 0.9, 0.06], [0.22, 0.82, 0.06]];
      const j = ctx.chain('bag', 'pelvis', pts);
      ctx.add(P.sack({ c: [0.215, 0.87, 0.06], r: [0.075, 0.095, 0.05], uv: ctx.uvOf('wool'), skin: (p) => { const t = Math.max(0, Math.min(1, (0.98 - p[1]) / 0.16)); return P.chainSkin(j, t); } }), { dye: HOLDS.seed });
      ctx.add(P.strap([[0.2, 0.98, 0.1], [0.08, 1.2, 0.15], [-0.11, 1.46, 0.08], [-0.13, 1.5, -0.02], [0.02, 1.25, -0.15], [0.2, 0.98, -0.08]], { grid: ctx.grid(), width: 0.024, lift: 0.006, uv: ctx.rectUV('rope'), skinNear: ctx.skinNear, along: 20 }), { dye: HOLDS.wicker });
    },
  },

  /* 8 — Cochineal Picker: a wool top, a stained apron, a skirt over trousers, carmine to the elbow */
  picker: {
    parts: [
      { part: 'Female_Ranger_Body', dye: HOLDS.wool, target: 1600 },
      { part: 'Female_Ranger_Body_Belt', from: 'Female_Ranger_Body', meshes: /Belt/, dye: HOLDS.leatherDark, target: 500 },
      { part: 'Female_Ranger_Arms', dye: HOLDS.woolDark, target: 1300, cutX: 0.40, cuff: HOLDS.woolDark, dropMat: /Regular/ },
      { part: 'Female_Ranger_Feet', dye: HOLDS.leather, target: 1500, cutTop: 0.3 },
    ],
    legsHidden: 1.0,
    pieces(ctx) {
      ctx.add(P.skirt({ grid: ctx.grid(), J: ctx.J, y0: 1.0, y1: 0.28, rHem: 0.26, uv: ctx.rectUV('panelA'), rows: 7, seg: 22, rFloor: 0.17, amp: 0.012, follow: 0.3 }), { dye: HOLDS.lapilli, hide: true, shade: 1.5 });
      apron(ctx, { y0: 1.25, y1: 0.46, wTop: 0.13, wBot: 0.2, dye: HOLDS.carmineStain, swatch: 'panelC', chainKey: 'apron', lift: 0.022, rows: 12, cols: 11, foldAmp: 0.009 });
      waistTie(ctx, { y: 1.04, dye: HOLDS.carmine });
      // a stain gourd on her hip
      const h = ctx.J.pelvis;
      ctx.add(P.sack({ c: [-0.205, 0.92, 0.02], r: [0.05, 0.065, 0.05], uv: ctx.uvOf('leather'), skin: P.rigid(h) }), { dye: HOLDS.leather });
    },
  },

  /* 9 — Tube Smith: a leather bib apron to the shin, bare forearms, a belt with a hammer */
  smith: {
    parts: [
      { part: 'Male_Ranger_Body', dye: HOLDS.woolDark, target: 2900, shade: 0.8, collar: { y0: 1.44, push: 0.014 } },
      { part: 'Male_Ranger_Arms', dye: HOLDS.leather, target: 900, cutX: 0.40, dropMat: /Regular/ },
      { part: 'Male_Ranger_Legs', dye: HOLDS.leatherDark, target: 900, shade: 1.5 },
      { part: 'Male_Ranger_Feet_Boots', dye: HOLDS.leatherDark, target: 1500, shade: 1.4 },
    ],
    pieces(ctx) {
      apron(ctx, { y0: 1.41, y1: 0.4, wTop: 0.15, wBot: 0.25, dye: HOLDS.leather, swatch: 'leather', lift: 0.016, chainKey: 'apron', foldAmp: 0.004, hemWave: 0.005, rows: 12, cols: 7 });
      waistTie(ctx, { y: 1.05, dye: HOLDS.leatherDark, h: 0.03 });
      pouch(ctx, { x: -0.25, y: 0.97, z: 0.0, r: [0.05, 0.065, 0.036], dye: HOLDS.leatherDark });
      for (const s of [1, -1]) ctx.add(P.strap([[s * 0.1, 1.4, 0.13], [s * 0.1, 1.5, 0.05], [s * 0.06, 1.53, -0.04], [-s * 0.05, 1.42, -0.13]], { grid: ctx.grid(), width: 0.026, lift: 0.006, uv: ctx.rectUV('leather'), skinNear: ctx.skinNear, along: 9 }), { dye: HOLDS.leatherDark });
      const hip = ctx.prop('prop_hip', 'pelvis', [0.22, 1.0, 0.0], [0.22, 0.8, 0.0]);
      for (const g of P.hammer({ at: [0.225, 0.98, 0.02], dir: [0, -1, 0.02], joint: hip, uvWood: ctx.uvOf('wood'), uvHead: ctx.uvOf('iron') })) ctx.add(g, { dye: HOLDS.iron, noHide: true, prop: 'prop_hip' });
      const pr = ctx.palm('r');
      const hand = ctx.prop('prop_hand', 'hand_r', pr, [pr[0], pr[1], pr[2] + 0.18]);
      for (const g of P.hammer({ at: pr, dir: [0.02, -0.05, 1], joint: hand, uvWood: ctx.uvOf('wood'), uvHead: ctx.uvOf('iron') })) ctx.add(g, { dye: HOLDS.iron, noHide: true, prop: 'prop_hand' });
    },
  },
};
