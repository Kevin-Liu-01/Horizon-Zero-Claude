/**
 * CALIMA · CPU-skinned measures for the armor gates (armory W1; plan §9
 * A-variant-swap-matrix). A dev / gate module: nothing in the game imports it, and
 * it allocates freely. Everything is measured off the live skeleton in world metres.
 *
 *   bindSnapshot(ctx)                     the T-pose edge lengths of the outfit + piece masks
 *   measurePose(ctx, snap)                one pose: stretch, weights, penetration, gear clearance
 */
import * as THREE from 'three';

const v = new THREE.Vector3();

function heroMeshes(ctx) {
  const hero = ctx.player.hero;
  const outfit = hero.outfit.meshes[0];
  let body = null;
  ctx.player.model.traverse((o) => { if (!body && o.isSkinnedMesh && o.geometry.getAttribute('_hidemask')) body = o; });
  return { hero, outfit, body, kit: hero.kit?.meshes?.[0] ?? null };
}

function worldPositions(mesh) {
  const pos = mesh.geometry.getAttribute('position');
  const out = new Float32Array(pos.count * 3);
  if (mesh.isSkinnedMesh) mesh.skeleton.update();
  mesh.updateWorldMatrix(true, false);
  for (let i = 0; i < pos.count; i++) {
    mesh.getVertexPosition(i, v);
    v.applyMatrix4(mesh.matrixWorld);
    out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
  }
  return out;
}

function triList(geo) {
  const idx = geo.getIndex();
  return idx ? idx.array : null;
}

function vertexNormals(P, tri, n) {
  const N = new Float32Array(n * 3);
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t], b = tri[t + 1], c = tri[t + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b, c]) { N[q * 3] += nx; N[q * 3 + 1] += ny; N[q * 3 + 2] += nz; }
  }
  for (let i = 0; i < n; i++) { const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l; }
  return N;
}

/** Uniform grid over world points: nearest k + signed height along their normals. */
class Grid {
  constructor(P, N, n, keep = null, cell = 0.05) {
    this.P = P; this.N = N; this.cell = cell;
    this.m = new Map();
    for (let i = 0; i < n; i++) {
      if (keep && !keep(i)) continue;
      const k = `${Math.floor(P[i * 3] / cell)},${Math.floor(P[i * 3 + 1] / cell)},${Math.floor(P[i * 3 + 2] / cell)}`;
      let a = this.m.get(k); if (!a) { a = []; this.m.set(k, a); } a.push(i);
    }
  }
  /** { h, dist, i }: height over the local surface (blend of the 3 nearest), or null when none within 2 cells. */
  height(x, y, z) {
    const { cell, P, N } = this;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    let best = [[1e9, -1], [1e9, -1], [1e9, -1]];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const L = this.m.get(`${cx + a},${cy + b},${cz + c}`);
      if (!L) continue;
      for (const i of L) {
        const d = (P[i * 3] - x) ** 2 + (P[i * 3 + 1] - y) ** 2 + (P[i * 3 + 2] - z) ** 2;
        if (d < best[2][0]) { best[2] = [d, i]; best.sort((u, w) => u[0] - w[0]); }
      }
    }
    if (best[0][1] < 0) return null;
    let nx = 0, ny = 0, nz = 0, h = 0, f = 0;
    for (const [d, i] of best) {
      if (i < 0) continue;
      const w = 1 / (d + 1e-5);
      nx += N[i * 3] * w; ny += N[i * 3 + 1] * w; nz += N[i * 3 + 2] * w;
      h += ((x - P[i * 3]) * N[i * 3] + (y - P[i * 3 + 1]) * N[i * 3 + 1] + (z - P[i * 3 + 2]) * N[i * 3 + 2]) * w;
      f += w;
    }
    return { h: h / f, dist: Math.sqrt(best[0][0]), i: best[0][1] };
  }
}

/**
 * The bind snapshot: edges and their T-pose lengths for the current outfit, plus the
 * weight audit, read off the source row at rest.
 */
export function bindSnapshot(ctx, opts = {}) {
  const { outfit, hero } = heroMeshes(ctx);
  // The rest pose off the SOURCE row, whose bones are never animated: `skeleton.pose()` would land in the
  // quantizer's normalised space (the GLB's inverse binds carry its decode), not in metres.
  let src = null;
  const root = ctx.assets.models[hero.outfit.row]?.root;
  root?.traverse((o) => { if (!src && o.isSkinnedMesh) src = o; });
  root.updateMatrixWorld(true);
  src.skeleton.update();
  const P = worldPositions(src);
  // The row's own normalisation out: a bone's world scale (the row is normalised to its own height, the
  // body to its): `bindL` = metres over the row's pelvis at her raw scale; lengths at her live scale.
  const nV = P.length / 3;
  const bindL = new Float32Array(P.length);
  const pelvis = src.skeleton.bones.find((b) => b.name === 'pelvis');
  const po = pelvis.getWorldPosition(new THREE.Vector3());
  const rs = pelvis.getWorldScale(new THREE.Vector3()).x || 1;
  const heroScale = outfit.skeleton.bones.find((b) => b.name === 'pelvis').getWorldScale(new THREE.Vector3()).x;
  const hipY = opts.pelvisRawY ?? 0.944;     // the UBC pelvis's raw height (so `bindL.y` reads like the recipes' y)
  for (let i = 0; i < nV; i++) { bindL[i * 3] = (P[i * 3] - po.x) / rs; bindL[i * 3 + 1] = (P[i * 3 + 1] - po.y) / rs + hipY; bindL[i * 3 + 2] = (P[i * 3 + 2] - po.z) / rs; }
  const tri = triList(outfit.geometry);
  // winding says outward only if a part was authored that way: keep the sign that agrees with its stored normal
  const NB = vertexNormals(bindL, tri, nV);
  const NA = outfit.geometry.getAttribute('normal');
  const flip = new Int8Array(nV);
  for (let i = 0; i < nV; i++) flip[i] = NB[i * 3] * NA.getX(i) + NB[i * 3 + 1] * NA.getY(i) + NB[i * 3 + 2] * NA.getZ(i) < 0 ? -1 : 1;
  const seen = new Set(), edges = [];
  const n = P.length / 3;
  for (let t = 0; t < tri.length; t += 3) {
    for (const [a, b] of [[tri[t], tri[t + 1]], [tri[t + 1], tri[t + 2]], [tri[t + 2], tri[t]]]) {
      const k = a < b ? a * n + b : b * n + a;
      if (seen.has(k)) continue;
      seen.add(k);
      const L = Math.hypot(bindL[a * 3] - bindL[b * 3], bindL[a * 3 + 1] - bindL[b * 3 + 1], bindL[a * 3 + 2] - bindL[b * 3 + 2]) * heroScale;
      if (L > 0.002) edges.push(a, b, L);
    }
  }
  // weights: sum to 1 +- 0.01, <= 4 influences (the glTF layout makes the second structural)
  const W = outfit.geometry.getAttribute('skinWeight');
  let worst = 0;
  for (let i = 0; i < W.count; i++) worst = Math.max(worst, Math.abs(W.getX(i) + W.getY(i) + W.getZ(i) + W.getW(i) - 1));
  const piece = outfit.geometry.getAttribute('_piece');
  return { edges, n, weightSumErr: +worst.toFixed(4), bindL, flip, piece: piece ? Array.from({ length: piece.count }, (_, i) => Math.round(piece.getX(i))) : null };
}

const segDist = (x, y, z, a, b) => {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby + (z - a.z) * abz) / (abx * abx + aby * aby + abz * abz || 1)));
  return Math.hypot(a.x + abx * t - x, a.y + aby * t - y, a.z + abz * t - z);
};

/** One pose, measured now. `opts.draw` measures the draw-hand and head clauses. */
export function measurePose(ctx, snap, opts = {}) {
  const { hero, outfit, body, kit } = heroMeshes(ctx);
  const an = ctx.player.animator;
  const P = worldPositions(outfit);
  const n = P.length / 3;
  const row = {};
  // (a) tearing
  let maxS = 0, over = 0;
  const E = snap.edges;
  const at = (i) => [+snap.bindL[i * 3].toFixed(3), +snap.bindL[i * 3 + 1].toFixed(3), +snap.bindL[i * 3 + 2].toFixed(3)];
  const badEdges = [];
  for (let e = 0; e < E.length; e += 3) {
    const a = E[e], b = E[e + 1], L = E[e + 2];
    const s = Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]) / L;
    if (s > maxS) maxS = s;
    if (s > 1.6) { over++; if (opts.offenders) badEdges.push([s, a, b, L]); }
  }
  row.stretch = +maxS.toFixed(3); row.stretchOver = over;
  if (opts.offenders) {
    const SIo = outfit.geometry.getAttribute('skinIndex'), SWo = outfit.geometry.getAttribute('skinWeight'), bn = outfit.skeleton.bones.map((b) => b.name);
    const sk = (i) => [0, 1, 2, 3].filter((k) => SWo.getComponent(i, k) > 0.02).map((k) => bn[SIo.getComponent(i, k)] + ':' + SWo.getComponent(i, k).toFixed(2)).join(' ');
    row.edgeOffenders = badEdges.sort((x, y) => y[0] - x[0]).filter((_, i) => i % Math.max(1, Math.floor(badEdges.length / 40)) === 0).slice(0, 40).map(([q, a, b, L]) => ({ s: +q.toFixed(2), a: at(a), b: at(b), L: +L.toFixed(4), ja: sk(a), jb: sk(b) }));
  }
  // (b) body penetration (all body triangles, hidden ones too)
  const BP = worldPositions(body);
  const bTri = triList(body.geometry);
  const bn = BP.length / 3;
  const BN = vertexNormals(BP, bTri, bn);
  const headJ = body.skeleton.bones.findIndex((b) => b.name === 'Head');
  const SI = body.geometry.getAttribute('skinIndex'), SW = body.geometry.getAttribute('skinWeight');
  const G = new Grid(BP, BN, bn);
  let inside = 0, headIn = 0, deepest = 0;
  const inOff = [];
  for (let i = 0; i < n; i++) {
    const q = G.height(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    if (!q) continue;
    if (q.h < -0.004 && q.dist < 0.05) {
      inside++;
      deepest = Math.min(deepest, q.h);
      if (SI.getX(q.i) === headJ && SW.getX(q.i) > 0.5) headIn++;
      if (opts.offenders) inOff.push([q.h, i]);
    }
  }
  row.insideFrac = +(inside / n).toFixed(4); row.inside = inside; row.headIn = headIn; row.deepest = +deepest.toFixed(4);
  if (opts.offenders) row.insideOffenders = inOff.sort((x, y) => x[0] - y[0]).filter((_, i) => i % Math.max(1, Math.floor(inOff.length / 60)) === 0).slice(0, 60).map(([h, i]) => [...at(i), +h.toFixed(3)]);
  // (c) stow kit and the held weapon vs the outfit
  const ON = vertexNormals(P, triList(outfit.geometry), n);
  for (let i = 0; i < n; i++) if (snap.flip[i] < 0) { ON[i * 3] *= -1; ON[i * 3 + 1] *= -1; ON[i * 3 + 2] *= -1; }
  // the finger tab is held against the shaft by the hand itself: it is not a garment a weapon can clip
  const OG = new Grid(P, ON, n, (i) => Math.abs(snap.bindL[i * 3]) < 0.55);
  let stowDeep = 0, stowOver = 0, kitN = 0;
  const stowOff = [];
  const PIECE = kit?.geometry.getAttribute('_piece');
  const hidden = hero.kit?.hidden ?? 0;
  let KP = null;
  if (kit) {
    KP = worldPositions(kit);
    for (let i = 0; i < KP.length / 3; i++) {
      const bit = Math.round(PIECE.getX(i));
      if (bit & hidden) continue;
      if (bit & 24) continue;          // the bracer and the alidade lie on the arm and the chest by design
      kitN++;
      const q = OG.height(KP[i * 3], KP[i * 3 + 1], KP[i * 3 + 2]);
      if (q && q.dist < 0.05 && q.h < 0) {
        stowDeep = Math.min(stowDeep, q.h);
        if (q.h < -0.005) { stowOver++; if (opts.offenders) stowOff.push([+q.h.toFixed(3), bit, ...at(q.i)]); }
      }
    }
  }
  row.stowDeep = +stowDeep.toFixed(4); row.stowOver = stowOver;
  if (opts.offenders) row.stowOffenders = stowOff.sort((x, y) => x[0] - y[0]).slice(0, 24);
  let heldDeep = 0, heldOver = 0;
  const heldOff = [];
  const heldMesh = [];
  ctx.player.model.traverse((o) => { if (o.isMesh && o.userData.heroPart === 'held') { let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) { vis = false; break; } if (vis) heldMesh.push(o); } });
  for (const m of heldMesh) {
    m.updateWorldMatrix(true, false);
    const pos = m.geometry.getAttribute('position'), bw = m.geometry.getAttribute('_bw');
    for (let i = 0; i < pos.count; i += 2) {
      if (bw && bw.getX(i) > 0.5) continue;    // the stave is what can touch her; string and arrow are drawn in the vertex stage
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      const q = OG.height(v.x, v.y, v.z);
      if (q && q.dist < 0.05 && q.h < 0) {
        heldDeep = Math.min(heldDeep, q.h);
        if (q.h < -0.005) { heldOver++; heldOff.push([+q.h.toFixed(3), +(bw ? bw.getY(i) : 0).toFixed(2), ...at(q.i)]); }
      }
    }
  }
  row.heldDeep = +heldDeep.toFixed(4); row.heldOver = heldOver; row.heldMeshes = heldMesh.length;
  if (heldOff.length) row.heldOffenders = heldOff.sort((x, y) => x[0] - y[0]).slice(0, opts.offenders ? 24 : 3);
  // (d) pauldron / capelet / collar vs the draw hand and the head, at full draw
  if (opts.draw) {
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    an.b.handR.bone.getWorldPosition(a);
    an.debugDrawHand?.(b, new THREE.Vector3());
    const hc = new THREE.Vector3(), hf = new THREE.Vector3();
    const R = an.skull(hc, hf);
    const hcW = ctx.player.model.localToWorld(hc.clone());
    const headR = Math.max(R.x, R.y, R.z);
    let toHand = 9, toHead = 9, handAt = null, headAt = null;
    for (let i = 0; i < n; i++) {
      const isPiece = snap.piece ? (snap.piece[i] & 1) !== 0 : false;
      const isCollar = snap.bindL[i * 3 + 1] > 1.44 && Math.abs(snap.bindL[i * 3]) < 0.2;
      if (!isPiece && !isCollar) continue;
      if (snap.piece && (snap.piece[i] & 96)) continue;
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      const d = segDist(x, y, z, a, b);
      if (d < toHand) { toHand = d; handAt = i; }
      if (isPiece) { const e = Math.hypot(x - hcW.x, y - hcW.y, z - hcW.z) - headR; if (e < toHead) { toHead = e; headAt = i; } }
    }
    row.pieceToHand = +toHand.toFixed(3); row.pieceToHead = toHead < 9 ? +toHead.toFixed(3) : null;
    if (opts.offenders) { row.handAt = handAt != null ? at(handAt) : null; row.headAt = headAt != null ? at(headAt) : null; }
  }
  // (e) the Guild Whites hat in its back socket vs the lance
  if (snap.piece && snap.piece.some((b) => b & 64) && KP && !(hidden & 1)) {
    let m = 9;
    const A = new THREE.Vector3().fromArray(hero.kit.carry ? hero.kit.carry.butt.toArray() : [0, 0, 0]).applyMatrix4(ctx.player.model.matrixWorld);
    const B = new THREE.Vector3().fromArray(hero.kit.carry ? hero.kit.carry.tip.toArray() : [0, 0, 0]).applyMatrix4(ctx.player.model.matrixWorld);
    for (let i = 0; i < n; i++) if (snap.piece[i] & 64) m = Math.min(m, segDist(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], A, B));
    row.hatToLance = +m.toFixed(3);
  }
  return row;
}

/**
 * The vertices that can be each stowed piece's lowest point: the bottom 6 % of its bind
 * height (plan §9 A-stow-clearance "every stowed item's lowest point"; melee's row reads the same).
 */
function kitLowPoints(kit) {
  if (kit.userData.__low) return kit.userData.__low;
  const g = kit.geometry, P = g.getAttribute('_piece'), pos = g.getAttribute('position');
  const low = {};
  for (const [name, bit] of Object.entries({ lance: 1, bow: 2, quiver: 4 })) {
    let lo = 9, hi = -9; const ids = [];
    for (let i = 0; i < pos.count; i++) { if ((Math.round(P.getX(i)) & bit) === 0) continue; const y = pos.getY(i); if (y < lo) lo = y; if (y > hi) hi = y; }
    const cut = lo + (hi - lo) * 0.06;
    for (let i = 0; i < pos.count; i++) { if ((Math.round(P.getX(i)) & bit) !== 0 && pos.getY(i) <= cut) ids.push(i); }
    low[name] = { bit, ids };
  }
  Object.defineProperty(kit.userData, '__low', { value: low, enumerable: false });
  return low;
}

/** Stowed gear vs the legs and ground, one frame (A-stow-clearance). `dCalf`: capsule 0.05 on calf-foot, 0.04 on the heel. */
export function stowFrame(ctx) {
  const { hero, kit } = heroMeshes(ctx);
  const an = ctx.player.animator;
  if (!kit) return null;
  kit.updateWorldMatrix(true, false);
  if (kit.skeleton) kit.skeleton.update();
  const low = kitLowPoints(kit);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), w = new THREE.Vector3();
  const caps = [];
  for (const [ca, fo] of [[an.b.calfL, an.b.footL], [an.b.calfR, an.b.footR]]) {
    ca.bone.getWorldPosition(a); fo.bone.getWorldPosition(b);
    caps.push([a.clone(), b.clone(), 0.05]);
    const ball = fo.bone.children.find((x) => x.isBone);
    if (ball) { ball.getWorldPosition(c); caps.push([b.clone(), c.clone(), 0.04]); }
  }
  let dCalf = 9, dPiece = null, lowAbove = 9, lowPiece = null;
  for (const [name, L] of Object.entries(low)) {
    if (hero.kit.hidden & L.bit) continue;
    for (const i of L.ids) {
      kit.getVertexPosition(i, w); kit.localToWorld(w);
      const gy = ctx.terrain?.getHeight?.(w.x, w.z) ?? 0;
      if (w.y - gy < lowAbove) { lowAbove = w.y - gy; lowPiece = name; }
      for (const [s0, s1, r] of caps) { const d = segDist(w.x, w.y, w.z, s0, s1) - r; if (d < dCalf) { dCalf = d; dPiece = name; } }
    }
  }
  return { dCalf: +dCalf.toFixed(3), dPiece, lowAboveGround: +lowAbove.toFixed(3), lowPiece };
}

/** The share of the head's screen box covered by stowed gear nearer than the head, from the live camera. By piece. */
export function headCover(ctx) {
  const { hero, kit } = heroMeshes(ctx);
  const an = ctx.player.animator;
  const cam = ctx.camera;
  cam.updateMatrixWorld();
  const hc = new THREE.Vector3(), hf = new THREE.Vector3();
  const R = an.skull(hc, hf);
  const headW = ctx.player.model.localToWorld(hc.clone());
  const hr = Math.max(R.x, R.y, R.z);
  const ctr = headW.clone().project(cam);
  const top = headW.clone(); top.y += hr; top.project(cam);
  const hh = Math.abs(top.y - ctr.y);
  const hw = hh * cam.projectionMatrix.elements[0] / cam.projectionMatrix.elements[5];
  const box = { x0: ctr.x - hw, x1: ctr.x + hw, y0: ctr.y - hh, y1: ctr.y + hh };
  const camD = cam.position.distanceTo(headW);
  const g = kit.geometry, P = g.getAttribute('_piece'), idx = g.getIndex();
  const N = 28, hit = new Uint8Array(N * N), byBit = { 1: new Uint8Array(N * N), 2: new Uint8Array(N * N), 4: new Uint8Array(N * N) };
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  const proj = (i, o) => { kit.getVertexPosition(i, o); kit.localToWorld(o); o.w = o.distanceTo(cam.position); o.project(cam); return o; };
  const hid = hero.kit.hidden | 0;
  for (let t = 0; t < idx.count; t += 3) {
    const i0 = idx.getX(t), i1 = idx.getX(t + 1), i2 = idx.getX(t + 2);
    const bit = Math.round(P.getX(i0));
    if ((bit & hid) || !(bit & 7)) continue;
    proj(i0, A); proj(i1, B); proj(i2, C);
    if (A.w > camD && B.w > camD && C.w > camD) continue;
    if (Math.max(A.x, B.x, C.x) < box.x0 || Math.min(A.x, B.x, C.x) > box.x1 || Math.max(A.y, B.y, C.y) < box.y0 || Math.min(A.y, B.y, C.y) > box.y1) continue;
    const area = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
    if (Math.abs(area) < 1e-9) continue;
    for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) {
      const px = box.x0 + (ix + 0.5) / N * (box.x1 - box.x0), py = box.y0 + (iy + 0.5) / N * (box.y1 - box.y0);
      const u = ((px - A.x) * (C.y - A.y) - (py - A.y) * (C.x - A.x)) / area;
      const w = ((py - A.y) * (B.x - A.x) - (px - A.x) * (B.y - A.y)) / area;
      if (u >= 0 && w >= 0 && u + w <= 1) { hit[iy * N + ix] = 1; if (byBit[bit]) byBit[bit][iy * N + ix] = 1; }
    }
  }
  const frac = (q) => { let n = 0; for (let i = 0; i < q.length; i++) n += q[i]; return +(n / q.length).toFixed(3); };
  return { cover: frac(hit), lance: frac(byBit[1]), bow: frac(byBit[2]), quiver: frac(byBit[4]) };
}
