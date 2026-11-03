/**
 * CALIMA · CPU-skinned measures for the armor gates (armory W1; plan §9
 * A-variant-swap-matrix). A dev / gate module: nothing in the game imports it, and
 * it allocates freely. Everything is measured off the live skeleton in world metres.
 *
 *   bindSnapshot(ctx)                     the T-pose edge lengths of the outfit + piece masks (poses the
 *                                         skeleton for one call, then restores every bone)
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
 * weight audit. Poses the skeleton once, in one call (no frame runs between), and
 * restores every bone's local transform.
 */
export function bindSnapshot(ctx) {
  const { outfit } = heroMeshes(ctx);
  const bones = outfit.skeleton.bones;
  const saved = bones.map((b) => [b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
  outfit.skeleton.pose();
  ctx.player.model.updateMatrixWorld(true);
  const P = worldPositions(outfit);
  bones.forEach((b, i) => { b.position.copy(saved[i][0]); b.quaternion.copy(saved[i][1]); b.scale.copy(saved[i][2]); });
  ctx.player.model.updateMatrixWorld(true);
  outfit.skeleton.update();
  const tri = triList(outfit.geometry);
  const seen = new Set(), edges = [];
  const n = P.length / 3;
  for (let t = 0; t < tri.length; t += 3) {
    for (const [a, b] of [[tri[t], tri[t + 1]], [tri[t + 1], tri[t + 2]], [tri[t + 2], tri[t]]]) {
      const k = a < b ? a * n + b : b * n + a;
      if (seen.has(k)) continue;
      seen.add(k);
      const L = Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
      if (L > 0.002) edges.push(a, b, L);
    }
  }
  // weights: sum to 1 +- 0.01, <= 4 influences (the glTF layout makes the second structural)
  const W = outfit.geometry.getAttribute('skinWeight');
  let worst = 0;
  for (let i = 0; i < W.count; i++) worst = Math.max(worst, Math.abs(W.getX(i) + W.getY(i) + W.getZ(i) + W.getW(i) - 1));
  const piece = outfit.geometry.getAttribute('_piece');
  return { edges, n, weightSumErr: +worst.toFixed(4), bindY: P.filter((_, i) => i % 3 === 1), piece: piece ? Array.from({ length: piece.count }, (_, i) => Math.round(piece.getX(i))) : null };
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
  for (let e = 0; e < E.length; e += 3) {
    const a = E[e], b = E[e + 1], L = E[e + 2];
    const s = Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]) / L;
    if (s > maxS) maxS = s;
    if (s > 1.6) over++;
  }
  row.stretch = +maxS.toFixed(3); row.stretchOver = over;
  // (b) body penetration (all body triangles, hidden ones too)
  const BP = worldPositions(body);
  const bTri = triList(body.geometry);
  const bn = BP.length / 3;
  const BN = vertexNormals(BP, bTri, bn);
  const headJ = body.skeleton.bones.findIndex((b) => b.name === 'Head');
  const SI = body.geometry.getAttribute('skinIndex'), SW = body.geometry.getAttribute('skinWeight');
  const G = new Grid(BP, BN, bn);
  let inside = 0, headIn = 0, deepest = 0;
  for (let i = 0; i < n; i++) {
    const q = G.height(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    if (!q) continue;
    if (q.h < -0.004 && q.dist < 0.05) {
      inside++;
      deepest = Math.min(deepest, q.h);
      if (SI.getX(q.i) === headJ && SW.getX(q.i) > 0.5) headIn++;
    }
  }
  row.insideFrac = +(inside / n).toFixed(4); row.inside = inside; row.headIn = headIn; row.deepest = +deepest.toFixed(4);
  // (c) stow kit and the held weapon vs the outfit
  const ON = vertexNormals(P, triList(outfit.geometry), n);
  const OG = new Grid(P, ON, n);
  let stowDeep = 0, stowOver = 0, kitN = 0;
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
      if (q && q.dist < 0.05 && q.h < 0) { stowDeep = Math.min(stowDeep, q.h); if (q.h < -0.005) stowOver++; }
    }
  }
  row.stowDeep = +stowDeep.toFixed(4); row.stowOver = stowOver;
  let heldDeep = 0, heldOver = 0;
  const heldMesh = [];
  ctx.player.model.traverse((o) => { if (o.isMesh && o.userData.heroPart === 'held') { let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) { vis = false; break; } if (vis) heldMesh.push(o); } });
  for (const m of heldMesh) {
    m.updateWorldMatrix(true, false);
    const pos = m.geometry.getAttribute('position'), bw = m.geometry.getAttribute('_bw');
    for (let i = 0; i < pos.count; i += 2) {
      if (bw && bw.getX(i) > 0.5) continue;    // the stave is what can touch her; string and arrow are drawn in the vertex stage
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      const q = OG.height(v.x, v.y, v.z);
      if (q && q.dist < 0.05 && q.h < 0) { heldDeep = Math.min(heldDeep, q.h); if (q.h < -0.005) heldOver++; }
    }
  }
  row.heldDeep = +heldDeep.toFixed(4); row.heldOver = heldOver; row.heldMeshes = heldMesh.length;
  // (d) pauldron / capelet / collar vs the draw hand and the head, at full draw
  if (opts.draw) {
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    an.b.handR.bone.getWorldPosition(a);
    an.debugDrawHand?.(b, new THREE.Vector3());
    const hc = new THREE.Vector3(), hf = new THREE.Vector3();
    const R = an.skull(hc, hf);
    const hcW = ctx.player.model.localToWorld(hc.clone());
    const headR = Math.max(R.x, R.y, R.z);
    let toHand = 9, toHead = 9;
    for (let i = 0; i < n; i++) {
      const isPiece = snap.piece ? (snap.piece[i] & 1) !== 0 : false;
      const isCollar = snap.bindY[i] > 1.44;
      if (!isPiece && !isCollar) continue;
      if (snap.piece && (snap.piece[i] & 96)) continue;
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      toHand = Math.min(toHand, segDist(x, y, z, a, b));
      if (isPiece) toHead = Math.min(toHead, Math.hypot(x - hcW.x, y - hcW.y, z - hcW.z) - headR);
    }
    row.pieceToHand = +toHand.toFixed(3); row.pieceToHead = toHead < 9 ? +toHead.toFixed(3) : null;
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

/** Stowed gear vs the legs and ground, one frame (A-stow-clearance). */
export function stowFrame(ctx) {
  const { hero, kit } = heroMeshes(ctx);
  const an = ctx.player.animator;
  if (!kit) return null;
  const P = worldPositions(kit);
  const PIECE = kit.geometry.getAttribute('_piece');
  const hidden = hero.kit.hidden;
  const legs = [];
  for (const k of ['thighL', 'thighR', 'calfL', 'calfR', 'footL', 'footR']) legs.push(an.b[k]?.bone || null);
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  let dCalf = 9, low = 1e9, lowX = 0, lowZ = 0;
  const segs = [];
  for (const [p, q] of [['calfL', 'footL'], ['calfR', 'footR']]) {
    if (!an.b[p] || !an.b[q]) continue;
    an.b[p].bone.getWorldPosition(a); an.b[q].bone.getWorldPosition(b);
    segs.push([a.clone(), b.clone()]);
  }
  for (let i = 0; i < P.length / 3; i += 2) {
    const bit = Math.round(PIECE.getX(i));
    if (bit & hidden) continue;
    if (bit & 24) continue;
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    if (y < low) { low = y; lowX = x; lowZ = z; }
    for (const [s0, s1] of segs) dCalf = Math.min(dCalf, segDist(x, y, z, s0, s1) - 0.055);   // calf capsule radius
  }
  const ground = ctx.terrain?.getHeight?.(lowX, lowZ) ?? 0;
  return { dCalf: +dCalf.toFixed(3), lowAboveGround: +(low - ground).toFixed(3) };
}

/** The share of the head's screen box covered by stowed gear, from the live camera. */
export function headCover(ctx) {
  const { hero, kit } = heroMeshes(ctx);
  const an = ctx.player.animator;
  const cam = ctx.camera;
  const hc = new THREE.Vector3(), hf = new THREE.Vector3();
  const R = an.skull(hc, hf);
  const c = ctx.player.model.localToWorld(hc.clone());
  const r = Math.max(R.x, R.y, R.z);
  const nv = c.clone().project(cam);
  const dist = cam.position.distanceTo(c);
  const scale = 1 / (Math.tan((cam.fov * Math.PI) / 360) * dist);
  const rx = (r * scale) / cam.aspect, ry = r * scale;
  const P = worldPositions(kit), PIECE = kit.geometry.getAttribute('_piece'), tri = kit.geometry.getIndex().array;
  const hidden = hero.kit.hidden;
  const N = 24;
  const grid = new Uint8Array(N * N);
  const px = (i) => { v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).project(cam); return [(v.x - nv.x) / (2 * rx) + 0.5, (v.y - nv.y) / (2 * ry) + 0.5, v.z]; };
  let boom = 0;
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t], b = tri[t + 1], cc = tri[t + 2];
    const bit = Math.round(PIECE.getX(a));
    if (bit & hidden || bit & 24) continue;
    const pa = px(a), pb = px(b), pc = px(cc);
    if (pa[2] > nv.z && pb[2] > nv.z && pc[2] > nv.z) continue;      // behind the head from here
    const x0 = Math.max(0, Math.floor(Math.min(pa[0], pb[0], pc[0]) * N)), x1 = Math.min(N - 1, Math.ceil(Math.max(pa[0], pb[0], pc[0]) * N));
    const y0 = Math.max(0, Math.floor(Math.min(pa[1], pb[1], pc[1]) * N)), y1 = Math.min(N - 1, Math.ceil(Math.max(pa[1], pb[1], pc[1]) * N));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const sx = (x + 0.5) / N, sy = (y + 0.5) / N;
      const d = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (pb[1] - pa[1]);
      if (Math.abs(d) < 1e-9) continue;
      const w0 = ((pb[0] - sx) * (pc[1] - sy) - (pc[0] - sx) * (pb[1] - sy)) / d, w1 = ((pc[0] - sx) * (pa[1] - sy) - (pa[0] - sx) * (pc[1] - sy)) / d, w2 = 1 - w0 - w1;
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) grid[y * N + x] = 1;
    }
  }
  void boom;
  let n = 0; for (let i = 0; i < N * N; i++) n += grid[i];
  return +(n / (N * N)).toFixed(3);
}
