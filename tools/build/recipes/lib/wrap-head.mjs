/**
 * CALIMA — a wound headwrap from a spec, and the standard hair + wrap atlas (character-art, W1;
 * R54, R56). The layer on top of lib/wrap.mjs and lib/hair.mjs that Brea and the headwrapped NPC
 * archetypes share. Node only, deterministic. API: docs/ROUND5-CHARACTER-ART.md §3.
 */
import { smooth, v3 } from './face.mjs';
import { TriGrid, webp } from './skin.mjs';
import { headForm, ellipsoidForm, clothStack, ribbon, crownCap, underShell, cullCovered, clothTail, vertexAO, fixWinding, WRAP_ATLAS, paintClothPanel, paintFrayEnd } from './wrap.mjs';
import { paintCoilTile, paintCoilFringe, paintLockTile, paintLashes, paintLidRim, coilTuft } from './hair.mjs';

/** rising(φ, τ): the normal of a small circle whose height is o + τ·cos(az - φ) (az: 0 forward, + her left). */
export const rising = (phi, tau) => { const t = Math.tan(tau); return v3.norm([-t * Math.sin(phi), 1, -t * Math.cos(phi)]); };
export const DEG = Math.PI / 180;
/**
 * A headwrap in layers from the skull out: a gathered crown, the base turn (low on the nape), any
 * number of crossing turns, optionally a wound topknot with a binding, a knot and a free tail on a
 * dyn_ chain, and a coil tuft on another. Everything rigid on `joint` except the two chains.
 *
 * Every layer lies on the ones under it (lib/wrap.mjs clothStack) and sends both hems under them,
 * then whatever a later layer wholly covers is dropped, and a closed dark shell inside it all stops
 * the eye if it ever finds its way under the cloth: models render FrontSide, the skull under the wrap
 * is culled, and a lifted hem would otherwise be a slit straight through the head.
 *
 *   headSoup     flat triangles of the head (no ears): the form the cloth rides on
 *   skin(d)      the true skin radius from `center` in direction d, ears included: where hems go, or null
 *   center       the form's centre (raw metres)
 *   lift(d)      the hair and padding the cloth rides on, by unit direction
 *   base         { tiltDeg, warpDeg, lowDeg, w, lift } the base turn: its low edge sits at lowDeg, + tilt up the
 *                front and down the nape, warpDeg lifting it over the ears
 *   turns        [{ phiDeg, tauDeg, oDeg, w, lift, seed, along, flip, bridge }] each rises toward azimuth phi
 *   bun          { c: [x,y,z], axis, r, topY } or null (topY fixes the bbox top)
 *   knot         [x,y,z] or null
 *   tail         { points, joints, width, side, curl, twist, gather, fold, rootBack } or null
 *   tail2        { points, joints, width, side, curl, twist, gather, fold, along, across } or null: a second,
 *                narrower cloth end (the other end of the knot) on its own chain
 *   tuft         { points, joints, count, along, width, side } or null (a coil tuft on a chain)
 * Returns { geo, parts, culled, covers(p), lowEdge(p), hemGap(p), soup, center }.
 */
export function woundHeadwrap({ headSoup, skin = null, joint, center, lift, base: B, turns, bun: bunSpec = null, knot: knotAt = null, tail = null, tail2 = null, tuft = null, shell = { seg: 12, rings: 4 } }) {
  const A = WRAP_ATLAS, W = A.W;
  const head = joint;
  const form = headForm(headSoup, { center, lift, blur: 2 });
  const stack = clothStack(form, { skin: skin ? (dx, dy, dz) => {
    const f = form.R(dx, dy, dz), r = skin(dx, dy, dz);
    // the ear stands proud of the form: a hem crosses it at the form, it does not climb over it
    return r === null ? f - lift(dx, dy, dz) : Math.min(r, f + 0.002);
  } : null });
  const uvA = (v, pxPerM = 1 / 0.00065) => ({ rect: A.clothA.rect, period: A.clothA.period, W, pxPerM, v });
  const uvB = (v, pxPerM = 1 / 0.00065) => ({ rect: A.clothB.rect, period: A.clothB.period, W, pxPerM, v });

  const parts = [];
  const add = (name, g) => { g.part = name; parts.push(g); return g; };
  const rowsBase = [-1, -0.94, -0.62, -0.18, 0.28, 0.7, 0.93, 1];
  // base turn: its low edge rises over the brow and the ears and falls down the nape
  const baseN = rising(0, B.tiltDeg * DEG);
  const baseW = B.w;
  const baseO = (B.lowDeg * DEG) + baseW;
  const baseWarp = (s) => B.warpDeg * DEG * Math.cos(2 * s);
  add('cap', crownCap(form, { elMin: 18 * DEG, rings: 5, seg: 20, lift: 0.0012, gather: 0.0012, uvRadial: true, joint: head, stack, uv: { rect: [A.clothB.rect[0], A.clothB.rect[1], A.clothB.period, A.clothB.rect[3]], W }, tiltAxis: [0, 0.94, -0.34] }));
  add('turn1', ribbon(form, { n: baseN, o0: baseO, w: baseW, warp: baseWarp, along: 36, rowsT: rowsBase, lift: B.lift ?? 0.0012, pillow: 0.0024, stack, bridge: 0, hemSink: 0.0028, creases: 3, creaseAmp: 0.0012, seed: 3, joint: head, uv: uvA([0, 1]) }));
  // the crossing turns: each rises across the forehead toward its own side, lying on what is under it
  const turnParts = turns.map((t, i) => add(`turn${i + 2}`, ribbon(form, { n: rising(t.phiDeg * DEG, t.tauDeg * DEG), o0: t.oDeg * DEG, w: t.w, along: t.along ?? 32, rowsT: rowsBase, lift: t.lift, pillow: t.pillow ?? 0.0026, stack, bridge: t.bridge ?? 0.06, hemSink: 0.0032, creases: 3, creaseAmp: t.creaseAmp ?? 0.0013, seed: t.seed, joint: head, uv: uvA(t.flip ? [1, 0] : [0, 1]) })));
  void turnParts;
  const headParts = parts.length;

  let bunForm = null, bunParts = [];
  if (bunSpec) {
    // the topknot: the same cloth wound round an egg, each turn on the last; the top height is fixed by TOP_Y
    const tilt = v3.norm(bunSpec.axis);
    const lr = A.lining.rect;
    const liningMid = [lr[0], lr[1] + Math.round(lr[3] * 0.42), lr[2], Math.round(lr[3] * 0.16)];
    const bunAt = (dy) => {
      const c = [bunSpec.c[0], bunSpec.c[1] + dy, bunSpec.c[2]];
      const f = ellipsoidForm(c, { r: bunSpec.r, rAxis: bunSpec.rAxis ?? bunSpec.r, axis: tilt, egg: 0.13, bump: 0.002, seed: 4 });
      const st = clothStack(f, { azN: 240, elN: 120 });
      const rows = [-1, -0.9, -0.5, 0, 0.5, 0.9, 1];
      const gs = [];
      gs.push(ribbon(f, { n: rotAbout(tilt, [1, 0, 0], 0.16), o0: -36 * DEG, w: 0.44, along: 22, rowsT: rows, lift: 0.0006, pillow: 0.0028, stack: st, bridge: 0, creases: 2, creaseAmp: 0.001, seed: 21, joint: head, uv: uvB([0, 1]), wander: 0.05 }));
      gs.push(ribbon(f, { n: rotAbout(tilt, [0.5, 0, 0.8], -0.22), o0: 4 * DEG, w: 0.46, along: 26, rowsT: rows, lift: 0.0008, pillow: 0.003, stack: st, bridge: 0.07, creases: 2, creaseAmp: 0.0011, seed: 27, joint: head, uv: uvA([1, 0]), wander: 0.05 }));
      gs.push(ribbon(f, { n: rotAbout(tilt, [-0.7, 0, 0.6], 0.2), o0: 40 * DEG, w: 0.46, along: 24, rowsT: rows, lift: 0.0008, pillow: 0.003, stack: st, bridge: 0.07, creases: 2, creaseAmp: 0.001, seed: 34, joint: head, uv: uvB([1, 0]), wander: 0.05 }));
      // the crown: the cloth's end pulled down into the centre in radial pleats (fix round 1: down to 31 deg, so no concentric turn
      // edges show from above; the turns and the cap carry more segments, so the bun's outline has no corners; the cap rides 3 mm
      // over the turns, so none pokes through it, its hem dives 6 mm under them, and it reads only 56 px of the panel's length, so its folds
      // run to the centre, not round it)
      gs.push(crownCap(f, { elMin: 31 * DEG, rings: 5, seg: 24, lift: 0.003, gather: 0.0019, pleats: 10, hem: 0.006, uvRadial: true, joint: head, stack: st, tiltAxis: tilt, uv: { rect: [A.knotFold.rect[0] + 40, A.knotFold.rect[1] + 6, 56, A.knotFold.rect[3] - 12], W } }));
      // nothing shows through under the turns: a closed dark egg inside them
      // fix round 1 (A-wrap-closed): below its waist the egg swells out into the head wrap, so the crease where the bun meets the wrap
      // is filled with cloth and no look along it sees the sky between them
      gs.push(underShell(f, { axis: tilt, oMin: () => -84 * DEG, seg: 14, rings: 5, joint: head, W, cloth: true, uv: [A.clothB.rect[0], A.clothB.rect[1], A.clothB.period, A.clothB.rect[3]], at: (dx, dy, dz) => f.R(dx, dy, dz) - 0.0006 + 0.012 * smooth(-0.1, -0.6, dx * tilt[0] + dy * tilt[1] + dz * tilt[2]) }));
      // the carmine binding where it meets the head: two turns of cord seated in the cloth
      const bindUV = { rect: liningMid, period: A.lining.period, W, pxPerM: 1 / 0.0012, v: [0.1, 0.9] };
      gs.push(ribbon(f, { n: tilt, o0: -35 * DEG, w: 0.052, along: 30, rowsT: [-1, 0, 1], lift: 0.0004, pillow: 0.0024, stack: st, bridge: 0, creases: 0, seed: 51, joint: head, uv: bindUV, wander: 0.012, hemStart: 0.55 }));
      gs.push(ribbon(f, { n: tilt, o0: -27 * DEG, w: 0.048, along: 30, rowsT: [-1, 0, 1], lift: 0.0004, pillow: 0.0022, stack: st, bridge: 0, creases: 0, seed: 57, joint: head, uv: bindUV, wander: 0.014, hemStart: 0.55 }));
      return { gs, c, f };
    };
    let bunR = bunAt(0);
    let top = -9;
    for (const g of bunR.gs) for (let i = 1; i < g.pos.length; i += 3) top = Math.max(top, g.pos[i]);
    bunR = bunAt(bunSpec.topY - top);
    const names = ['bun0', 'bun1', 'bun2', 'bun3', 'bunShell', 'binding', 'binding2'];
    bunR.gs.forEach((g, i) => add(names[i], g));
    bunParts = bunR.gs; bunForm = bunR.f;
  }
  // the wrap knot the tail leaves from: a small wound knot
  let knotForm = null, knotParts = [];
  if (knotAt) {
    const k0 = knotAt;
    knotForm = ellipsoidForm([k0[0] - 0.009, k0[1] + 0.011, k0[2] + 0.021], { r: 0.0265, rAxis: 0.024, axis: [0.3, 0.8, -0.5], egg: 0.05 });
    const kst = clothStack(knotForm, { azN: 120, elN: 60 });
    const rows = [-1, -0.85, -0.3, 0.3, 0.85, 1];
    // a closed egg inside it: from behind, the far hems would otherwise hang in the air like wires. Fix round 1 (A-wrap-closed): the
    // knot's two turns sink their hems 1.6 mm, and the egg stands 1.2 mm proud of the knot form, so no lip stands off its side with
    // the background behind it
    add('knotShell', underShell(knotForm, { axis: [0.3, 0.8, -0.5], oMin: () => -82 * DEG, seg: 12, rings: 5, joint: head, W, cloth: true, uv: [A.knotFold.rect[0], A.knotFold.rect[1], A.knotFold.period, A.knotFold.rect[3]], at: (dx, dy, dz) => knotForm.R(dx, dy, dz) + 0.0012 }));
    knotParts = [
      add('knot', ribbon(knotForm, { n: [0.5, 0.6, -0.6], o0: -14 * DEG, w: 0.86, along: 12, rowsT: rows, lift: 0, pillow: 0.0011, hemSink: 0.0016, stack: kst, bridge: 0, creases: 2, creaseAmp: 0.0007, seed: 41, joint: head, uv: { rect: A.knotFold.rect, period: A.knotFold.period, W, pxPerM: 1 / 0.0012, v: [0, 1] }, wander: 0.04 })),
      add('knot2', ribbon(knotForm, { n: [-0.6, 0.7, 0.3], o0: 14 * DEG, w: 0.8, along: 12, rowsT: rows, lift: 0.0003, pillow: 0.0011, hemSink: 0.0016, stack: kst, bridge: 0.1, creases: 2, creaseAmp: 0.0007, seed: 47, joint: head, uv: { rect: A.knotFold.rect, period: A.knotFold.period, W, pxPerM: 1 / 0.0012, v: [1, 0] }, wander: 0.04 })),
    ];
  }
  // the free tail on its chain, with a real section
  if (tail) {
    add('tail', clothTail(tail.points, tail.joints, {
      along: tail.along ?? 16, across: tail.across ?? 4, width: tail.width, side: tail.side, thick: tail.thick ?? 0.004, curl: tail.curl ?? 0.10, twist: tail.twist ?? 0, gather: tail.gather ?? 0.7, gatherTo: tail.gatherTo ?? 0.16, roll: tail.roll ?? 0, fold: tail.fold ?? 0.0052, rootBack: tail.rootBack ?? 0,
      rootRows: tail.rootRows ?? null, smoothSkin: tail.smoothSkin ?? false, hem: tail.hem ?? 0, ripple: tail.ripple ?? 0, open: tail.open ?? null, pleats: tail.pleats ?? 0,
      uvFront: { rect: A.clothA.rect, period: A.clothA.period, W, pxPerM: 1 / 0.00065, v: [1, 0] },
      uvBack: { rect: A.lining.rect, period: A.lining.period, W, pxPerM: 1 / 0.0012, v: [0, 1] },
      uvEnd: A.frayEnd.rect, fray: tail.fray ?? 0.1,
    }));
  }
  // the other end of the knot: a narrow cloth end, the carmine lining showing where it twists
  if (tail2) {
    add('tail2', clothTail(tail2.points, tail2.joints, {
      along: tail2.along ?? 8, across: tail2.across ?? 2, width: tail2.width, side: tail2.side, thick: 0.003, curl: tail2.curl ?? 0.12, twist: tail2.twist ?? 0, gather: tail2.gather ?? 0.55, fold: tail2.fold ?? 0.0022, seed: 19, rootBack: tail2.rootBack ?? 0,
      uvFront: { rect: A.tailA.rect, period: A.tailA.period, W, pxPerM: 1 / 0.0009, v: [1, 0] },
      uvBack: { rect: A.tailA.rect, period: A.tailA.period, W, pxPerM: 1 / 0.0009, v: [0, 1] },
      uvEnd: A.frayEnd.rect, fray: 0.14,
    }));
  }
  // a tuft of coils on its own chain
  if (tuft) add('locks', coilTuft(tuft.points, tuft.joints, { count: tuft.count ?? 4, along: tuft.along ?? 6, width: tuft.width ?? 0.04, uv: { rect: A.coilTile.rect, period: A.coilTile.period, W }, side: tuft.side ?? [1, 0, 0] }));

  // ---- what a later layer wholly covers is dropped (depth(p) > 0: p lies under a covering)
  const under = (g, p) => { const c = g.center, x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2], l = Math.hypot(x, y, z) || 1; const r = g.radiusAt(x / l, y / l, z / l); return r === null ? -1 : r - l; };
  const insideForm = (f, p) => { if (!f) return -1; const c = f.center, x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2], l = Math.hypot(x, y, z) || 1; return f.R(x / l, y / l, z / l) - l; };
  const insideHead = (p) => { const c = center, x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2], l = Math.hypot(x, y, z) || 1; return stack.topAt(x / l, y / l, z / l) - l; };
  const culled = {};
  const covered = (i) => {
    const g = parts[i];
    if (g.part === 'tail' || g.part === 'tail2' || g.part === 'locks') return;
    const later = [];
    if (i < headParts) { for (let j = i + 1; j < headParts; j++) later.push(parts[j]); }
    const isBun = bunParts.includes(g), isKnot = knotParts.includes(g);
    if (isBun) for (const h of bunParts.slice(bunParts.indexOf(g) + 1)) if (h.part !== 'binding' && h.part !== 'binding2' && h.part !== 'bunShell') later.push(h);
    if (isKnot) for (const h of knotParts.slice(knotParts.indexOf(g) + 1)) later.push(h);
    const depth = (p) => {
      let d = -1;
      for (const h of later) d = Math.max(d, under(h, p));
      if (i < headParts) { d = Math.max(d, insideForm(bunForm, p) - 0.002, insideForm(knotForm, p) - 0.001); }
      if (isBun || isKnot) d = Math.max(d, insideHead(p) - 0.0015);
      return d;
    };
    culled[g.part] = cullCovered(g, depth);
  };
  for (let i = 0; i < parts.length; i++) covered(i);

  // the closed shell the eye stops at, dark, seated under the cloth and inside the skin the wrap leaves
  const lowO = (s) => baseO - baseW + baseWarp(s);
  if (shell) {
    const s0 = A.clothB.rect;
    add('shell', underShell(form, { axis: baseN, oMin: (s) => lowO(s) + 0.055, seg: shell.seg, rings: shell.rings, joint: head, W, uv: [s0[0], s0[1] + 40, 40, 40], at: (dx, dy, dz) => stack.skinAt(dx, dy, dz) - 0.0018 }));
  }

  // contact shadow between the layers: every part against all of them + the head
  const soup = Array.from(headSoup);
  for (const g of parts) for (let t = 0; t < g.idx.length; t++) { const i = g.idx[t]; soup.push(g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]); }
  const grid = new TriGrid(new Float32Array(soup), 0.012);
  for (const g of parts) {
    if (g.part === 'locks') continue;                  // the tuft carries its own root shade and edge alpha
    if (g.part === 'shell') { const n = g.pos.length / 3; g.col = []; for (let i = 0; i < n; i++) g.col.push(0.2, 0.15, 0.2, 1); continue; }
    vertexAO(g, grid, { rays: 48, maxD: 0.028, floor: 0.4 });
  }
  for (const g of parts) compactGeo(g);
  const geo = joinGeos(parts);
  const covers = (p) => {
    // a skull vertex well inside the cloth: above the base turn's low edge by a margin
    const d = v3.norm([p[0] - center[0], p[1] - center[1], p[2] - center[2]]);
    const a2 = Math.asin(Math.max(-1, Math.min(1, v3.dot(d, baseN))));
    const s = sAround(baseN, d);
    const lowO2 = baseO - baseW + baseWarp(s);
    return a2 > lowO2 + 0.13;
  };
  const stats = Object.fromEntries(parts.map((g) => [g.part, g.idx.length / 3]));
  return { geo, parts: stats, culled, covers, form, stack, center, soup: new Float32Array(soup.slice(headSoup.length)), lowEdge: (p) => {
    const d = v3.norm([p[0] - center[0], p[1] - center[1], p[2] - center[2]]);
    const s = sAround(baseN, d);
    return Math.asin(Math.max(-1, Math.min(1, v3.dot(d, baseN)))) - (baseO - baseW + baseWarp(s));
  },
  /** Metres of bare skin between a point on the head and the first hem above it (Infinity past `max`; 0 when covered). */
  hemGap: (p, max = 0.04) => {
    const x = p[0] - center[0], y = p[1] - center[1], z = p[2] - center[2], r = Math.hypot(x, y, z) || 1;
    const el0 = Math.asin(y / r), az = Math.atan2(x, z);
    for (let k = 0; k * 0.0012 <= max; k++) {
      const el = el0 + (k * 0.0012) / r;
      if (el > Math.PI / 2) break;
      const dx = Math.sin(az) * Math.cos(el), dy = Math.sin(el), dz = Math.cos(az) * Math.cos(el);
      if (stack.coveredAt(dx, dy, dz)) return k * 0.0012;
    }
    return Infinity;
  } };
}

/** Remove the vertices a geometry bucket no longer references. */
export function compactGeo(g) {
  const n = g.pos.length / 3, map = new Int32Array(n).fill(-1);
  let m = 0;
  for (const i of g.idx) if (map[i] < 0) map[i] = m++;
  if (m === n) return g;
  const take = (A, s) => { if (!A || A.length !== n * s) return A; const o = new Array(m * s); for (let i = 0; i < n; i++) if (map[i] >= 0) for (let k = 0; k < s; k++) o[map[i] * s + k] = A[i * s + k]; return o; };
  g.pos = take(g.pos, 3); g.nrm = take(g.nrm, 3); g.uv = take(g.uv, 2); g.jnt = take(g.jnt, 4); g.wgt = take(g.wgt, 4); g.col = take(g.col, 4);
  g.idx = g.idx.map((i) => map[i]);
  return g;
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
function paintFacing(buf, rect, W, dye, frac) {
  const [x0, y0, w, h] = rect;
  const D = hexOf(dye);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h, d = Math.min(v, 1 - v);
    const k = 1 - smooth(frac - 0.012, frac + 0.012, d);
    const stitch = 1 - 0.2 * (1 - smooth(0.004, 0.018, Math.abs(d - frac)));
    for (let x = 0; x < w; x++) {
      const o = ((y0 + y) * W + x0 + x) * 4;
      const l = (buf.base[o] * 0.5 + buf.base[o + 1] + buf.base[o + 2] * 0.5) / (163 * 0.5 + 33 + 58 * 0.5);
      const s = Math.max(0.7, Math.min(1.25, l));
      buf.base[o] = Math.round((buf.base[o] + (D[0] * s - buf.base[o]) * k) * stitch);
      buf.base[o + 1] = Math.round((buf.base[o + 1] + (D[1] * s - buf.base[o + 1]) * k) * stitch);
      buf.base[o + 2] = Math.round((buf.base[o + 2] + (D[2] * s - buf.base[o + 2]) * k) * stitch);
    }
  }
}
const hexOf = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export async function paintWrapAtlas(doc, wrapMat, { deep = '#5A2E66', violet = '#6B3F73', dark = '#4A2456', mid = '#63356F', stripe = '#A3213A', lining = ['#A3213A', '#8E1C33', '#B02A43'], facing = 0.3 } = {}) {
  const A = WRAP_ATLAS, W = A.W;
  const buf = { base: Buffer.alloc(W * W * 4), normal: Buffer.alloc(W * W * 3), orm: Buffer.alloc(W * W * 3) };
  for (let i = 0; i < W * W; i++) { buf.base[i * 4] = 40; buf.base[i * 4 + 1] = 22; buf.base[i * 4 + 2] = 48; buf.base[i * 4 + 3] = 2; buf.normal[i * 3] = 128; buf.normal[i * 3 + 1] = 128; buf.normal[i * 3 + 2] = 255; buf.orm[i * 3] = 255; buf.orm[i * 3 + 1] = 230; }
  paintClothPanel(buf, { ...A.clothA, W, dye: deep, dye2: mid, dye3: dark, seed: 2, creases: 7, stripe, stripeAt: 8, fringe: 2 });
  paintClothPanel(buf, { ...A.clothB, W, dye: deep, dye2: dark, dye3: mid, seed: 5, creases: 9, sigma: [0.022, 0.06], amp: [0.00022, 0.00055], fringe: 2, creaseWander: 0.28, drag: 0.35 });
  paintClothPanel(buf, { ...A.tailA, W, dye: deep, dye2: mid, dye3: violet, seed: 9, creases: 5, mmU: 0.9, mmV: 1.56, sigma: [0.05, 0.16], amp: [0.0006, 0.0014], fringe: 2, stripe, stripeAt: 5 });
  paintClothPanel(buf, { ...A.lining, W, dye: lining[0], dye2: lining[1], dye3: lining[2], seed: 13, creases: 3, mmU: 1.2, mmV: 1.56, fringe: 0, weave: 0.25 });
  // the violet is turned back over the lining at both selvedges, a broad facing: the tail's inner face is mostly orchil with a
  // carmine centre (bible §3.4: carmine is 6 % of her), and the binding reads the carmine centre
  paintFacing(buf, A.lining.rect, W, deep, facing);
  paintClothPanel(buf, { ...A.knotFold, W, dye: deep, dye2: dark, dye3: dark, seed: 17, creases: 9, sigma: [0.03, 0.07], amp: [0.0005, 0.0011], mmU: 1.2, mmV: 0.7, fringe: 3 });
  paintFrayEnd(buf, { ...A.frayEnd, W, dye: deep });
  paintCoilTile(buf, { ...A.coilTile, W, seed: 21 });
  paintCoilFringe(buf, { ...A.coilFringe, W });
  paintLockTile(buf, { ...A.lockTile, W });
  paintLashes(buf, { ...A.lashes, W });
  paintLidRim(buf, { ...A.lidRim, W });
  const make = async (name, bytes) => doc.createTexture(name).setImage(bytes).setMimeType('image/webp').setURI(`${name}.webp`);
  const baseTex = wrapMat.getBaseColorTexture(), nTex = wrapMat.getNormalTexture();
  baseTex.setImage(await webp(buf.base, W, { channels: 4, quality: 88, alphaQuality: 100 })).setMimeType('image/webp').setURI('brea-hairwrap-base.webp');
  nTex.setImage(await webp(buf.normal, W, { quality: 88 })).setMimeType('image/webp').setURI('brea-hairwrap-normal.webp');
  const ormTex = await make('brea-hairwrap-orm', await webp(buf.orm, W, { quality: 82 }));
  wrapMat.setMetallicRoughnessTexture(ormTex);
  wrapMat.setRoughnessFactor(1).setMetallicFactor(1).setDoubleSided(true).setBaseColorFactor([1, 1, 1, 1]);
  wrapMat.setAlphaMode('MASK').setAlphaCutoff(0.5);
  wrapMat.setEmissiveTexture(baseTex).setEmissiveFactor([0.09, 0.09, 0.09]);      // the same fill as the skin: dark cloth keeps its folds in shade
  return { ok: true };
}

