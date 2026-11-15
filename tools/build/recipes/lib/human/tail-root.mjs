/**
 * CALIMA — M1.2c "the tail root is a gathered cloth volume", measured on the mesh (M1a fix round 1: the judge marked it
 * UNMEASURED, so a FAIL, and asked for a row).
 *
 *   node tools/build/recipes/lib/human/tail-root.mjs [public/models/hero/brea.glb]     ({ root: tailRoot, free: tailFree })
 *
 * Bind pose, game metres. The tail's root is Brea_HairWrap's vertices skinned mostly to the wrap tail's chain (dyn_wrapSash_*)
 * within 7 cm of its first link's axis, cut into 3 cm slabs along that link from the knot (dyn_wrapSash_01) out to 9 cm. Each
 * slab's cross-section (perpendicular to the link) gives its two extents by PCA: a flat strip is wide and thin (minor under a
 * centimetre, minor / major under 0.25); a gathered cloth volume is thick both ways. Returns { slabs: [{ s0, s1, n, majorMm,
 * minorMm, ratio }], minMinorMm, minRatio }. The row (hero-art.test.mjs A-tail-root-volume): every slab to 9 cm 15 mm or
 * more thick, its thickness at least 0.4 of its width.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from './face.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

export async function tailRoot(file, { slabs = [[0, 0.03], [0.03, 0.06], [0.06, 0.09]] } = {}) {
  const THREE = await import('three');
  const doc = await (await io()).read(file);
  const root = doc.getRoot();
  const wm = new Map();
  const W = (n) => { if (wm.has(n)) return wm.get(n); const p = n.listParents().find((q) => q.propertyType === 'Node'); const m = (p ? W(p).clone() : new THREE.Matrix4()).multiply(new THREE.Matrix4().fromArray(n.getMatrix())); wm.set(n, m); return m; };
  const node = root.listNodes().find((n) => n.getName() === 'Brea_HairWrap');
  const skin = node.getSkin(), J = skin.listJoints();
  const jp = (name) => new THREE.Vector3().setFromMatrixPosition(W(J.find((j) => j.getName() === name)));
  const a = jp('dyn_wrapSash_01'), b = jp('dyn_wrapSash_02');
  const ax = b.clone().sub(a).normalize();
  const prim = node.getMesh().listPrimitives()[0];
  const P = prim.getAttribute('POSITION'), JJ = prim.getAttribute('JOINTS_0'), WW = prim.getAttribute('WEIGHTS_0');
  const ibm = skin.getInverseBindMatrices();
  const jm = J.map((j, k) => { const e = []; ibm.getElement(k, e); return W(j).clone().multiply(new THREE.Matrix4().fromArray(e)); });
  const pts = [];
  const p = [], jj = [], ww = [], v = new THREE.Vector3(), acc = new THREE.Vector3(), t = new THREE.Vector3();
  for (let i = 0; i < P.getCount(); i++) {
    P.getElement(i, p); JJ.getElement(i, jj); WW.getElement(i, ww); v.set(...p); acc.set(0, 0, 0);
    for (let k = 0; k < 4; k++) if (ww[k]) { t.copy(v).applyMatrix4(jm[jj[k]]); acc.addScaledVector(t, ww[k]); }
    let chain = 0; for (let k = 0; k < 4; k++) if (ww[k] && /^dyn_wrapSash_/.test(J[jj[k]].getName())) chain += ww[k];
    if (chain < 0.5) continue;
    const d = acc.clone().sub(a), s = d.dot(ax), perp = d.clone().sub(ax.clone().multiplyScalar(s));
    if (perp.length() < 0.07) pts.push({ s, perp });
  }
  const u = Math.abs(ax.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const e1 = u.clone().sub(ax.clone().multiplyScalar(u.dot(ax))).normalize(), e2 = ax.clone().cross(e1);
  const out = [];
  for (const [s0, s1] of slabs) {
    const xy = pts.filter((q) => q.s >= s0 && q.s < s1).map((q) => [q.perp.dot(e1), q.perp.dot(e2)]);
    if (xy.length < 4) { out.push({ s0, s1, n: xy.length, majorMm: 0, minorMm: 0, ratio: 0 }); continue; }
    const mx = xy.reduce((s, q) => s + q[0], 0) / xy.length, my = xy.reduce((s, q) => s + q[1], 0) / xy.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of xy) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const r1 = xy.map((q) => (q[0] - mx) * Math.cos(th) + (q[1] - my) * Math.sin(th)), r2 = xy.map((q) => -(q[0] - mx) * Math.sin(th) + (q[1] - my) * Math.cos(th));
    const x1 = Math.max(...r1) - Math.min(...r1), x2 = Math.max(...r2) - Math.min(...r2);
    const major = Math.max(x1, x2), minor = Math.min(x1, x2);
    out.push({ s0, s1, n: xy.length, majorMm: +(major * 1000).toFixed(1), minorMm: +(minor * 1000).toFixed(1), ratio: +(minor / major).toFixed(2) });
  }
  return { linkMm: +(a.distanceTo(b) * 1000).toFixed(1), slabs: out, minMinorMm: Math.min(...out.map((q) => q.minorMm)), minRatio: Math.min(...out.map((q) => q.ratio)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const f = path.resolve(process.argv[2] || path.join(ROOT, 'public/models/hero/brea.glb'));
  console.log(JSON.stringify({ root: await tailRoot(f), free: await tailFree(f) }));
}

/**
 * M1a round 3 (M1.2c, the review: "the tail is still a stiff flat strip in profile" in F09, F10, F12, F13, F17): the FREE strip's
 * cross-sections, link by link, on the same bind-pose skin. Each link of dyn_wrapSash from the third on takes the vertices whose
 * heaviest chain joint it is; their section across the link (perpendicular to it) gives its width and thickness by PCA, as the root's
 * slabs do. A flat ribbon is wide and thin (ratio under 0.2); gathered, folded cloth keeps a third of its width as depth.
 * Returns { links: [{ link, n, majorMm, minorMm, ratio }], minRatio, meanRatio }.
 */
export async function tailFree(file, { from = 2 } = {}) {
  const THREE = await import('three');
  const doc = await (await io()).read(file);
  const root = doc.getRoot();
  const wm = new Map();
  const W = (n) => { if (wm.has(n)) return wm.get(n); const p = n.listParents().find((q) => q.propertyType === 'Node'); const m = (p ? W(p).clone() : new THREE.Matrix4()).multiply(new THREE.Matrix4().fromArray(n.getMatrix())); wm.set(n, m); return m; };
  const node = root.listNodes().find((n) => n.getName() === 'Brea_HairWrap');
  const skin = node.getSkin(), J = skin.listJoints();
  const chain = J.map((j, k) => [j.getName(), k]).filter(([nm]) => /^dyn_wrapSash_/.test(nm)).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  // (names sort _01 .. _07 then _end)
  const jpos = chain.map(([, k]) => new THREE.Vector3().setFromMatrixPosition(W(J[k])));
  const prim = node.getMesh().listPrimitives()[0];
  const P = prim.getAttribute('POSITION'), JJ = prim.getAttribute('JOINTS_0'), WW = prim.getAttribute('WEIGHTS_0');
  const ibm = skin.getInverseBindMatrices();
  const jm = J.map((j, k) => { const e = []; ibm.getElement(k, e); return W(j).clone().multiply(new THREE.Matrix4().fromArray(e)); });
  const byLink = chain.map(() => []);
  const p = [], jj = [], ww = [], v = new THREE.Vector3(), acc = new THREE.Vector3(), t = new THREE.Vector3();
  for (let i = 0; i < P.getCount(); i++) {
    P.getElement(i, p); JJ.getElement(i, jj); WW.getElement(i, ww);
    let best = -1, bw = 0, tot = 0;
    for (let k = 0; k < 4; k++) { const c = chain.findIndex(([, q]) => q === jj[k]); if (ww[k] && c >= 0) { tot += ww[k]; if (ww[k] > bw) { bw = ww[k]; best = c; } } }
    if (best < 0 || tot < 0.5) continue;
    v.set(...p); acc.set(0, 0, 0);
    for (let k = 0; k < 4; k++) if (ww[k]) { t.copy(v).applyMatrix4(jm[jj[k]]); acc.addScaledVector(t, ww[k]); }
    byLink[best].push(acc.clone());
  }
  const links = [];
  for (let c = from; c + 1 < chain.length; c++) {
    const ax = jpos[c + 1].clone().sub(jpos[c]).normalize();
    const u = Math.abs(ax.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const e1 = u.clone().sub(ax.clone().multiplyScalar(u.dot(ax))).normalize(), e2 = ax.clone().cross(e1);
    const xy = byLink[c].map((q) => { const d = q.clone().sub(jpos[c]); return [d.dot(e1), d.dot(e2)]; });
    if (xy.length < 4) { links.push({ link: chain[c][0], n: xy.length, majorMm: 0, minorMm: 0, ratio: 0 }); continue; }
    const mx = xy.reduce((s, q) => s + q[0], 0) / xy.length, my = xy.reduce((s, q) => s + q[1], 0) / xy.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of xy) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const r1 = xy.map((q) => (q[0] - mx) * Math.cos(th) + (q[1] - my) * Math.sin(th)), r2 = xy.map((q) => -(q[0] - mx) * Math.sin(th) + (q[1] - my) * Math.cos(th));
    const x1 = Math.max(...r1) - Math.min(...r1), x2 = Math.max(...r2) - Math.min(...r2);
    const major = Math.max(x1, x2), minor = Math.min(x1, x2);
    links.push({ link: chain[c][0], n: xy.length, majorMm: +(major * 1000).toFixed(1), minorMm: +(minor * 1000).toFixed(1), ratio: +(minor / major).toFixed(2) });
  }
  const r = links.map((q) => q.ratio);
  return { links, minRatio: Math.min(...r), meanRatio: +(r.reduce((s, x) => s + x, 0) / r.length).toFixed(2) };
}
