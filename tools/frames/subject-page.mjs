/**
 * THE SUBJECT CHECK BEFORE THE SHUTTER, IN THE PAGE (Milestone 3 rule 17; area F's EF4). Served by Vite and imported by
 * tools/frames/film.mjs after page.mjs has staged and frozen a frame and before its screenshot:
 *
 *   const r = await (await import('/tools/frames/subject-page.mjs')).checkSubjects(frameId, subjects)
 *   -> { id, pass, refusal, subjects: [{ name, pass, passed, of, need, why, members: [{ name, px, share, box, inLens,
 *        visible, samples, pass, why }] }], ms }
 *
 * Each subject (tools/frames/subjects.mjs) is resolved to its members on the live page, each member to sample points
 * (world), and judged by tools/frames/subject-math.mjs from the lens the frame is filmed through: the screen box, the
 * share in the safe area, and the share unoccluded on a ray from the lens. A ray is blocked by the drawn ground (the
 * terrain's height, marched) or by the first drawn mesh in front of the sample (three's Raycaster over every visible,
 * opaque mesh outside the terrain's own chunks, the sky and anything round the lens), less the member's own tolerance.
 * Nothing here changes the frame: it reads the frozen world and the lens.
 */
import * as THREE from 'three';
import * as M from './subject-math.mjs';

const V = THREE.Vector3;

function lensOf(cam, W, H) {
  cam.updateMatrixWorld();
  const e = cam.matrixWorld.elements;
  const right = [e[0], e[1], e[2]], up = [e[4], e[5], e[6]], fwd = [-e[8], -e[9], -e[10]];
  const tanY = Math.tan((cam.fov * Math.PI) / 360);
  return { pos: [e[12], e[13], e[14]], fwd, right, up, tanY, tanX: tanY * cam.aspect, W, H };
}

const pathGet = (root, p) => p.split('.').reduce((o, k) => (o == null ? o : o[k]), root);
const isDrawn = (o) => o.visible !== false && (o.isMesh || o.isSkinnedMesh || o.isInstancedMesh);

/** Up to `n` world points spread over an object's drawn vertices (skinned where it is skinned). */
function vertexSamples(root, n = 48) {
  const pts = [], all = [];
  root.updateMatrixWorld(true);
  root.traverseVisible((m) => { if (m.isMesh && m.geometry?.attributes?.position) all.push(m); });
  const total = all.reduce((s, m) => s + m.geometry.attributes.position.count, 0);
  if (!total) return pts;
  const B = new V();
  for (const m of all) {
    const pos = m.geometry.attributes.position, k = Math.max(1, Math.round((n * pos.count) / total));
    const stride = Math.max(1, Math.floor(pos.count / k));
    for (let i = 0; i < pos.count && pts.length < n * 2; i += stride) {
      if (m.getVertexPosition) m.getVertexPosition(i, B); else B.fromBufferAttribute(pos, i);
      B.applyMatrix4(m.matrixWorld);
      if (m.isInstancedMesh) continue;
      pts.push([B.x, B.y, B.z]);
    }
  }
  return pts;
}

function occluderList(C, camPos) {
  const out = [];
  const T = C.terrain?.group || null;
  const inTerrainChunks = (o) => { for (let q = o; q; q = q.parent) { if (q === T) return true; } return false; };
  const keepUnderTerrain = (o) => { for (let q = o; q; q = q.parent) { if (q.name === 'malpais' || q.name === 'kiln-yards') return true; } return false; };
  const c = new V(...camPos), s = new THREE.Sphere();
  C.scene.traverseVisible((o) => {
    if (!isDrawn(o)) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    if (ms.some((m) => !m || m.visible === false || m.colorWrite === false || (m.transparent && (m.opacity ?? 1) < 0.9) || m.depthWrite === false || m.side === THREE.BackSide)) return;
    if (T && inTerrainChunks(o) && !keepUnderTerrain(o)) return;   // the ground is the height field's, marched
    const g = o.geometry; if (!g) return;
    if (!g.boundingSphere) g.computeBoundingSphere?.();
    if (g.boundingSphere && !o.isInstancedMesh) { s.copy(g.boundingSphere).applyMatrix4(o.matrixWorld); if (s.containsPoint(c) && s.radius > 30) return; }   // a dome round the lens
    out.push(o);
  });
  return out;
}

/** Resolve a subject to members: [{ name, roots: Object3D[] (excluded from its own occlusion), pts, tol }]. */
function membersOf(C, s, L, ground) {
  const p = C.player, an = p?.animator;
  if (s.kind === 'hero') return p?.model?.visible ? [{ name: 'Brea', roots: [p.model], pts: vertexSamples(p.model, 60), tol: 0.15 }] : [];
  if (s.kind === 'object') { const o = C.scene.getObjectByName(s.object); return o && o.visible ? [{ name: s.object, roots: [o], pts: vertexSamples(o, 48), tol: 0.1 }] : []; }
  if (s.kind === 'path') { const o = pathGet(C, s.path); return o?.isObject3D && o.visible && o.parent ? [{ name: s.path, roots: [o], pts: vertexSamples(o, 32), tol: 0.1 }] : []; }
  if (s.kind === 'machines') {
    return (C.machines?.list || []).filter((m) => m.kind === s.machine && m.root?.visible && !m._disposed && m.root.parent)
      .map((m, i) => ({ name: `${s.machine}-${i + 1}`, roots: [m.root], pts: vertexSamples(m.root, 40), tol: 0.2 }));
  }
  if (s.kind === 'people') {
    return (C.people?.list || []).filter((q) => q.group?.visible && q.group.parent)
      .map((q) => ({ name: q.spec?.id || q.id || 'person', roots: [q.group], pts: vertexSamples(q.group, 32), tol: 0.15 }));
  }
  if (s.kind === 'bone') {
    const b = an?.b?.[s.bone]?.bone;
    if (!b) return [];
    const c = b.getWorldPosition(new V()), r = s.r ?? 0.1, pts = [[c.x, c.y, c.z]];
    for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) pts.push([c.x + d[0] * r, c.y + d[1] * r, c.z + d[2] * r]);
    return [{ name: s.bone, roots: [b], pts, tol: r + 0.05 }];
  }
  if (s.kind === 'shapes') {
    return s.shapes.map((sh) => ({ name: sh.id, roots: [], tol: Math.max(0.3, (sh.r || 0.5) * 2),
      pts: M.shapeSamples(sh, ground, L).map((q) => (sh.onGround ? [q[0], Math.max(q[1], ground(q[0], q[2]) + 1), q[2]] : q)) }));
  }
  if (s.kind === 'sun') {
    const d = C.environment?.sunDir;
    if (!d) return [];
    return [{ name: 'disc', roots: [], pts: [[L.pos[0] + d.x * 4000, L.pos[1] + d.y * 4000, L.pos[2] + d.z * 4000]], tol: 1, sun: true }];
  }
  return [];
}

export async function checkSubjects(frameId, subjects, { W = innerWidth, H = innerHeight, budgetMs = 25000 } = {}) {
  const t0 = performance.now();
  const C = window.__CTX__, cam = C.camera;
  const L = lensOf(cam, W, H);
  const ground = (x, z) => (C.terrain?.getHeight ? C.terrain.getHeight(x, z) : 0);
  const occ = occluderList(C, L.pos);
  const rc = new THREE.Raycaster();
  const O = new V(...L.pos), Dir = new V();
  const ownOf = (roots) => (o) => { for (let q = o; q; q = q.parent) if (roots.includes(q)) return true; return false; };
  const blocked = (pt, tol, mine) => {
    if (M.groundBlocks(ground, L.pos, pt, tol)) return true;
    Dir.set(pt[0] - L.pos[0], pt[1] - L.pos[1], pt[2] - L.pos[2]);
    const d = Dir.length(); Dir.divideScalar(d);
    rc.set(O, Dir); rc.near = 0.3; rc.far = Math.max(0.3, d - tol);
    const hits = rc.intersectObjects(occ, false);
    return hits.some((h) => !mine(h.object));
  };
  const out = [];
  for (const s of subjects) {
    if (performance.now() - t0 > budgetMs) { out.push({ name: s.name, pass: false, why: [`the check ran out of its ${budgetMs} ms`], members: [] }); continue; }
    if (s.kind === 'ground') {
      const map = C.engine?.regions?.map;
      if (!map) { out.push({ name: s.name, pass: false, why: ['no regions map in the page'], members: [] }); continue; }
      const g = M.groundShare(L, ground, (x, z) => map.regionAt(x, z) === s.region, {
        // a mesh in front of the ground it strikes (the blockout, a building) is not that ground
        blocked: (dir, t) => { Dir.set(dir[0], dir[1], dir[2]); rc.set(O, Dir); rc.near = 0.3; rc.far = Math.max(0.3, t - 0.5); return rc.intersectObjects(occ, false).length > 0; },
      });
      const pass = g.share >= (s.minShare || 0);
      out.push({ name: s.name, pass, share: g.share, groundShare: g.groundShare, why: pass ? [] : [`${(g.share * 100).toFixed(1)} % of the frame is ${s.region} ground < ${((s.minShare || 0) * 100).toFixed(0)} %`], members: [] });
      continue;
    }
    if (s.kind === 'dom') {
      const el = document.querySelector(s.selector), r = el?.getBoundingClientRect?.();
      const shown = !!el && r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
      const px = shown ? Math.round(r.height) : 0;
      const pass = shown && px >= (s.minPx || 0);
      out.push({ name: s.name, pass, passed: pass ? 1 : 0, of: el ? 1 : 0, need: 1, why: pass ? [] : [el ? `${px} px tall, shown ${shown}` : `no element ${s.selector} on the page`], members: [] });
      continue;
    }
    if (!s.missing) s.missing = 'none of it is drawn in this frame';
    const members = membersOf(C, s, L, ground).map((m) => {
      const scr = m.pts.map((p) => M.project(L, p));
      const mine = ownOf(m.roots);
      const occluded = m.pts.map((p, i) => (M.inSafe(L, scr[i]) ? blocked(p, m.tol, mine) : null));
      const spec = m.sun ? { ...s, inLens: 1, visible: 1 } : s;
      return { name: m.name, ...M.judgeMember(L, spec, scr, occluded) };
    });
    out.push(M.judgeSubject(s, members));
  }
  const refusal = M.refusal(frameId, out);
  return { id: frameId, pass: !refusal, refusal, subjects: out, occluders: occ.length, lens: { pos: L.pos.map((v) => +v.toFixed(2)), fov: cam.fov }, ms: Math.round(performance.now() - t0) };
}
