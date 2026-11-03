/**
 * CALIMA — a wound headwrap from a spec, and the standard hair + wrap atlas (character-art, W1;
 * R54, R56). The layer on top of lib/wrap.mjs and lib/hair.mjs that Brea and the headwrapped NPC
 * archetypes share. Node only, deterministic. API: docs/ROUND5-CHARACTER-ART.md §3.
 */
import { smooth, v3 } from './face.mjs';
import { TriGrid, webp } from './skin.mjs';
import { headForm, ellipsoidForm, ribbon, crownCap, cordRing, clothTail, vertexAO, fixWinding, WRAP_ATLAS, paintClothPanel, paintFrayEnd } from './wrap.mjs';
import { paintCoilTile, paintCoilFringe, paintLockTile, paintLashes, coilTuft } from './hair.mjs';

/** rising(φ, τ): the normal of a small circle whose height is o + τ·cos(az - φ) (az: 0 forward, + her left). */
export const rising = (phi, tau) => { const t = Math.tan(tau); return v3.norm([-t * Math.sin(phi), 1, -t * Math.cos(phi)]); };
export const DEG = Math.PI / 180;
/**
 * A headwrap in layers from the skull out: a gathered crown, the base turn (low on the nape), any
 * number of crossing turns, optionally a wound topknot with a binding, a knot and a free tail on a
 * dyn_ chain, and a coil tuft on another. Everything rigid on `joint` except the two chains.
 *
 *   headSoup     flat triangles of the head (no ears)
 *   center       the form's centre (raw metres)
 *   lift(d)      the hair and padding the cloth rides on, by unit direction
 *   base         { tiltDeg, warpDeg, lowDeg, w } the base turn: its low edge sits at lowDeg, + tilt up the
 *                front and down the nape, warpDeg lifting it over the ears
 *   turns        [{ phiDeg, tauDeg, oDeg, w, lift, seed, along, flip }] each rises toward azimuth phi
 *   bun          { c: [x,y,z], axis, r, topY } or null (topY fixes the bbox top)
 *   knot         [x,y,z] or null
 *   tail         { points, joints, width, side, curl, twist, gather, fold } or null
 *   tail2        { points, joints, width, side, curl, twist, gather, fold, along, across } or null: a second,
 *                narrower cloth end (the other end of the knot) on its own chain
 *   tuft         { points, joints, count, along, width, side } or null (a coil tuft on a chain)
 * Returns { geo, parts, covers(p), lowEdge(p), soup, center }.
 */
export function woundHeadwrap({ headSoup, joint, center, lift, base: B, turns, bun: bunSpec = null, knot: knotAt = null, tail = null, tail2 = null, tuft = null }) {
  const A = WRAP_ATLAS, W = A.W;
  const head = joint;
  const form = headForm(headSoup, { center, lift, blur: 2 });
  const uvA = (v, pxPerM = 1 / 0.00065) => ({ rect: A.clothA.rect, period: A.clothA.period, W, pxPerM, v });
  const uvB = (v, pxPerM = 1 / 0.00065) => ({ rect: A.clothB.rect, period: A.clothB.period, W, pxPerM, v });

  const parts = [];
  const add = (name, g) => { g.part = name; parts.push(g); return g; };
  const rowsBase = [-1, -0.94, -0.74, -0.42, -0.06, 0.32, 0.68, 0.92, 1];
  // base turn: low edge at +13 deg over the brow, +9 deg over the ears, -27 deg on the nape
  const baseN = rising(0, B.tiltDeg * DEG);
  const baseW = B.w;
  const baseO = (B.lowDeg * DEG) + baseW;
  const baseWarp = (s) => B.warpDeg * DEG * Math.cos(2 * s);
  add('cap', crownCap(form, { elMin: 18 * DEG, rings: 4, seg: 20, lift: 0.0046, joint: head, uv: { rect: [A.clothB.rect[0], A.clothB.rect[1], A.clothB.period, A.clothB.rect[3]], W }, tiltAxis: [0, 0.94, -0.34] }));
  add('turn1', ribbon(form, { n: baseN, o0: baseO, w: baseW, warp: baseWarp, along: 36, rowsT: rowsBase, lift: 0.0026, pillow: 0.0024, creases: 3, creaseAmp: 0.0012, seed: 3, joint: head, uv: uvA([0, 1]) }));
  // the crossing turns: each rises across the forehead toward its own side
  turns.forEach((t, i) => add(`turn${i + 2}`, ribbon(form, { n: rising(t.phiDeg * DEG, t.tauDeg * DEG), o0: t.oDeg * DEG, w: t.w, along: t.along ?? 32, rowsT: rowsBase, lift: t.lift, pillow: t.pillow ?? 0.0026, creases: 3, creaseAmp: t.creaseAmp ?? 0.0013, seed: t.seed, joint: head, uv: uvA(t.flip ? [1, 0] : [0, 1]) })));

  if (bunSpec) {
    // the topknot: the same cloth wound round an egg; the top height is fixed by TOP_Y
    const tilt = v3.norm(bunSpec.axis);
    const bunAt = (dy) => {
      const c = [bunSpec.c[0], bunSpec.c[1] + dy, bunSpec.c[2]];
      const f = ellipsoidForm(c, { r: bunSpec.r, rAxis: bunSpec.r, axis: tilt, egg: 0.13, bump: 0.002, seed: 4 });
      const rows = [-1, -0.9, -0.5, 0, 0.5, 0.9, 1];
      const gs = [
        crownCap(f, { elMin: -80 * DEG, rings: 6, seg: 12, lift: -0.0012, gather: 0, joint: head, uv: { rect: [A.knotFold.rect[0], A.knotFold.rect[1] + 8, 64, 48], W }, tiltAxis: tilt }),
        ribbon(f, { n: rotAbout(tilt, [1, 0, 0], 0.16), o0: -36 * DEG, w: 0.44, along: 20, rowsT: rows, lift: 0, pillow: 0.0028, hemDrop: 0.004, creases: 2, creaseAmp: 0.001, seed: 21, joint: head, uv: uvB([0, 1]), wander: 0.05 }),
        ribbon(f, { n: rotAbout(tilt, [0.5, 0, 0.8], -0.22), o0: 4 * DEG, w: 0.46, along: 20, rowsT: rows, lift: 0.0022, pillow: 0.003, hemDrop: 0.0045, creases: 2, creaseAmp: 0.0011, seed: 27, joint: head, uv: uvA([1, 0]), wander: 0.05 }),
        ribbon(f, { n: rotAbout(tilt, [-0.7, 0, 0.6], 0.2), o0: 42 * DEG, w: 0.5, along: 18, rowsT: rows, lift: 0.0044, pillow: 0.003, hemDrop: 0.0045, creases: 2, creaseAmp: 0.001, seed: 34, joint: head, uv: uvB([1, 0]), wander: 0.05 }),
        crownCap(f, { elMin: 46 * DEG, rings: 3, seg: 16, lift: 0.0022, gather: 0, joint: head, uv: { rect: [A.clothB.rect[0], A.clothB.rect[1], A.clothB.period, A.clothB.rect[3]], W }, tiltAxis: tilt }),
      ];
      return { gs, c };
    };
    let bunR = bunAt(0);
    let top = -9;
    for (const g of bunR.gs) for (let i = 1; i < g.pos.length; i += 3) top = Math.max(top, g.pos[i]);
    bunR = bunAt(bunSpec.topY - top);
    bunR.gs.forEach((g, i) => add(`bun${i}`, g));
    // its carmine binding where it meets the head: two turns of cord
    const bc = [0, bunR.c[1] - tilt[1] * 0.033, bunR.c[2] - tilt[2] * 0.033];
    const lr = A.lining.rect;
    add('binding', cordRing(bc, tilt, 0.0568, 0.0031, { seg: 20, sides: 4, joint: head, uvRect: [lr[0], lr[1] + 10, lr[2], lr[3] - 20], W }));
    add('binding2', cordRing([bc[0], bc[1] + tilt[1] * 0.0072, bc[2] + tilt[2] * 0.0072], tilt, 0.0578, 0.0027, { seg: 20, sides: 4, joint: head, uvRect: [lr[0], lr[1] + 10, lr[2], lr[3] - 20], W, wob: 0.03 }));
  }
  // the wrap knot the tail leaves from: a small wound knot
  if (knotAt) {
    const k0 = knotAt;
    const kf = ellipsoidForm([k0[0] - 0.006, k0[1] + 0.012, k0[2] + 0.014], { r: 0.0235, rAxis: 0.022, axis: [0.3, 0.8, -0.5], egg: 0.05 });
    add('knot', ribbon(kf, { n: [0.5, 0.6, -0.6], o0: -12 * DEG, w: 0.62, along: 10, rowsT: [-1, -0.85, -0.3, 0.3, 0.85, 1], lift: 0, pillow: 0.0015, hemDrop: 0.002, creases: 2, creaseAmp: 0.0007, seed: 41, joint: head, uv: { rect: A.knotFold.rect, period: A.knotFold.period, W, pxPerM: 1 / 0.0012, v: [0, 1] }, wander: 0.04 }));
    add('knot2', ribbon(kf, { n: [-0.6, 0.7, 0.3], o0: 12 * DEG, w: 0.6, along: 10, rowsT: [-1, -0.85, -0.3, 0.3, 0.85, 1], lift: 0.002, pillow: 0.0015, hemDrop: 0.002, creases: 2, creaseAmp: 0.0007, seed: 47, joint: head, uv: { rect: A.knotFold.rect, period: A.knotFold.period, W, pxPerM: 1 / 0.0012, v: [1, 0] }, wander: 0.04 }));
  }
  // the free tail on its chain, with a real section
  if (tail) {
    add('tail', clothTail(tail.points, tail.joints, {
      along: tail.along ?? 16, across: tail.across ?? 4, width: tail.width, side: tail.side, thick: 0.004, curl: tail.curl ?? 0.10, twist: tail.twist ?? 0, gather: tail.gather ?? 0.7, gatherTo: tail.gatherTo ?? 0.16, roll: tail.roll ?? 0, fold: tail.fold ?? 0.0052,
      uvFront: { rect: A.clothA.rect, period: A.clothA.period, W, pxPerM: 1 / 0.00065, v: [1, 0] },
      uvBack: { rect: A.lining.rect, period: A.lining.period, W, pxPerM: 1 / 0.0012, v: [0, 1] },
      uvEnd: A.frayEnd.rect, fray: 0.1,
    }));
  }
  // the other end of the knot: a narrow cloth end, the carmine lining showing where it twists
  if (tail2) {
    add('tail2', clothTail(tail2.points, tail2.joints, {
      along: tail2.along ?? 8, across: tail2.across ?? 2, width: tail2.width, side: tail2.side, thick: 0.003, curl: tail2.curl ?? 0.12, twist: tail2.twist ?? 0, gather: tail2.gather ?? 0.55, fold: tail2.fold ?? 0.0022, seed: 19,
      uvFront: { rect: A.tailA.rect, period: A.tailA.period, W, pxPerM: 1 / 0.0009, v: [1, 0] },
      uvBack: { rect: A.lining.rect, period: A.lining.period, W, pxPerM: 1 / 0.0012, v: [0, 1] },
      uvEnd: A.frayEnd.rect, fray: 0.14,
    }));
  }
  // a tuft of coils on its own chain
  if (tuft) add('locks', coilTuft(tuft.points, tuft.joints, { count: tuft.count ?? 4, along: tuft.along ?? 6, width: tuft.width ?? 0.04, uv: { rect: A.coilTile.rect, period: A.coilTile.period, W }, side: tuft.side ?? [1, 0, 0] }));

  // contact shadow between the layers: every part against all of them + the head
  const soup = Array.from(headSoup);
  for (const g of parts) for (let t = 0; t < g.idx.length; t++) { const i = g.idx[t]; soup.push(g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]); }
  const grid = new TriGrid(new Float32Array(soup), 0.012);
  for (const g of parts) {
    if (g.part === 'locks') continue;                  // the tuft carries its own root shade and edge alpha
    vertexAO(g, grid, { rays: 32, maxD: 0.028, floor: 0.36 });
  }
  const geo = joinGeos(parts);
  const covers = (p) => {
    // a skull vertex well inside the cloth: above the base turn's low edge by a margin
    const d = v3.norm([p[0] - center[0], p[1] - center[1], p[2] - center[2]]);
    const a2 = Math.asin(Math.max(-1, Math.min(1, v3.dot(d, baseN))));
    const s = sAround(baseN, d);
    const lowO = baseO - baseW + baseWarp(s);
    return a2 > lowO + 0.13;
  };
  const stats = Object.fromEntries(parts.map((g) => [g.part, g.idx.length / 3]));
  return { geo, parts: stats, covers, form, center, soup: new Float32Array(soup.slice(headSoup.length)), lowEdge: (p) => {
    const d = v3.norm([p[0] - center[0], p[1] - center[1], p[2] - center[2]]);
    const s = sAround(baseN, d);
    return Math.asin(Math.max(-1, Math.min(1, v3.dot(d, baseN)))) - (baseO - baseW + baseWarp(s));
  } };
}

/** The ribbon's angle s for direction d (same basis as lib/wrap.mjs ribbon). */
function sAround(n, d) {
  const fwd = Math.abs(n[2]) > 0.95 ? [1, 0, 0] : [0, 0, 1];
  const e1 = v3.norm(v3.sub(fwd, v3.mul(n, v3.dot(fwd, n)))), e2 = v3.cross(n, e1);
  return Math.atan2(v3.dot(d, e2), v3.dot(d, e1));
}

/** Rodrigues: v turned by `a` about the axis. */
export function rotAbout(v, axis, a) {
  const k = v3.norm(axis), c = Math.cos(a), s = Math.sin(a);
  return v3.norm(v3.add(v3.add(v3.mul(v, c), v3.mul(v3.cross(k, v), s)), v3.mul(k, v3.dot(k, v) * (1 - c))));
}

/** Join geometry buckets (with their vertex colours; a part without one is white). */
export function joinGeos(list) {
  const o = { pos: [], nrm: [], uv: [], jnt: [], wgt: [], idx: [], col: [] };
  for (const g of list) {
    fixWinding(g);
    const base = o.pos.length / 3;
    const n = g.pos.length / 3;
    for (const k of ['pos', 'nrm', 'uv', 'jnt', 'wgt']) { const src = g[k]; for (let i = 0; i < src.length; i++) o[k].push(src[i]); }
    if (g.col && g.col.length === n * 4) { for (let i = 0; i < g.col.length; i++) o.col.push(g.col[i]); } else for (let i = 0; i < n; i++) o.col.push(1, 1, 1, 1);
    for (let i = 0; i < g.idx.length; i++) o.idx.push(g.idx[i] + base);
  }
  return o;
}

/** The hair + wrap atlas (512²): base RGBA, normal, ORM (lib/wrap.mjs WRAP_ATLAS). */
export async function paintWrapAtlas(doc, wrapMat, { deep = '#5A2E66', violet = '#6B3F73', dark = '#4A2456', mid = '#63356F', stripe = '#A3213A', lining = ['#A3213A', '#8E1C33', '#B02A43'] } = {}) {
  const A = WRAP_ATLAS, W = A.W;
  const buf = { base: Buffer.alloc(W * W * 4), normal: Buffer.alloc(W * W * 3), orm: Buffer.alloc(W * W * 3) };
  for (let i = 0; i < W * W; i++) { buf.base[i * 4] = 40; buf.base[i * 4 + 1] = 22; buf.base[i * 4 + 2] = 48; buf.base[i * 4 + 3] = 2; buf.normal[i * 3] = 128; buf.normal[i * 3 + 1] = 128; buf.normal[i * 3 + 2] = 255; buf.orm[i * 3] = 255; buf.orm[i * 3 + 1] = 230; }
  paintClothPanel(buf, { ...A.clothA, W, dye: deep, dye2: mid, dye3: dark, seed: 2, creases: 7, stripe, stripeAt: 8, fringe: 2 });
  paintClothPanel(buf, { ...A.clothB, W, dye: deep, dye2: dark, dye3: mid, seed: 5, creases: 11, sigma: [0.018, 0.05], amp: [0.0003, 0.0008], fringe: 2 });
  paintClothPanel(buf, { ...A.tailA, W, dye: deep, dye2: mid, dye3: violet, seed: 9, creases: 5, mmU: 0.9, mmV: 1.56, sigma: [0.05, 0.16], amp: [0.0006, 0.0014], fringe: 2, stripe, stripeAt: 5 });
  paintClothPanel(buf, { ...A.lining, W, dye: lining[0], dye2: lining[1], dye3: lining[2], seed: 13, creases: 3, mmU: 1.2, mmV: 1.56, fringe: 0, weave: 0.25 });
  paintClothPanel(buf, { ...A.knotFold, W, dye: deep, dye2: dark, dye3: dark, seed: 17, creases: 9, sigma: [0.03, 0.07], amp: [0.0005, 0.0011], mmU: 1.2, mmV: 0.7, fringe: 3 });
  paintFrayEnd(buf, { ...A.frayEnd, W, dye: deep });
  paintCoilTile(buf, { ...A.coilTile, W, seed: 21 });
  paintCoilFringe(buf, { ...A.coilFringe, W });
  paintLockTile(buf, { ...A.lockTile, W });
  paintLashes(buf, { ...A.lashes, W });
  const make = async (name, bytes) => doc.createTexture(name).setImage(bytes).setMimeType('image/webp').setURI(`${name}.webp`);
  const baseTex = wrapMat.getBaseColorTexture(), nTex = wrapMat.getNormalTexture();
  baseTex.setImage(await webp(buf.base, W, { channels: 4, quality: 88, alphaQuality: 100 })).setMimeType('image/webp').setURI('brea-hairwrap-base.webp');
  nTex.setImage(await webp(buf.normal, W, { quality: 88 })).setMimeType('image/webp').setURI('brea-hairwrap-normal.webp');
  const ormTex = await make('brea-hairwrap-orm', await webp(buf.orm, W, { quality: 82 }));
  wrapMat.setMetallicRoughnessTexture(ormTex);
  wrapMat.setRoughnessFactor(1).setMetallicFactor(1).setDoubleSided(true).setBaseColorFactor([1, 1, 1, 1]);
  wrapMat.setAlphaMode('MASK').setAlphaCutoff(0.5);
  return { ok: true };
}

