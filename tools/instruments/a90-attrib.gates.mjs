/**
 * A90 ATTRIBUTION (diagnostic, not a frozen row). The registered A90-memory-stability assert, run unchanged, with
 * a census before and after it that says WHERE a geometry or object delta lives:
 *
 *   node tools/gates.mjs --port <p> --extra tools/instruments/a90-attrib.gates.mjs --only A90-attrib
 *
 * The census: renderer geometry and texture counts; the terrain's LOD geometry cache (every chunk keeps each
 * LOD it was ever drawn at, terrain.js `_chunkGeo`); the unique geometries and the objects under each child of
 * the scene; the machines (alive, dead, wrecks waiting on the site lifecycle). The row's own pass and numbers are
 * returned as they are; `attrib` is added to its detail.
 *
 * M1a round 3: THE GEOMETRY LEDGER. `renderer.info.memory.geometries` counts every geometry the renderer has
 * uploaded and not yet seen disposed, in or out of the scene, so a census of the scene cannot say what the delta is.
 * The ledger wraps `renderer.renderBufferDirect` (every draw, the shadow passes and post quads included, goes through
 * it) and records each geometry the first time it is drawn: its owner (the machine kind and part, the terrain chunk,
 * the top-level scene child, the object's name), whether it was first drawn before the row or during it, and its
 * `dispose` event. Weak references only, so it holds nothing alive. At the end: per owner, the geometries first drawn
 * during the row and never disposed (`grew`), split into those still in the scene and those out of it (a leak), and
 * the ones first drawn before the row that were disposed during it (`freed`). grew - freed is the renderer's delta.
 */
import { GATES as BASE } from '../gates.config.mjs';

const row = BASE.find((g) => g.id === 'A90-memory-stability');
if (!row) throw new Error('a90-attrib: A90-memory-stability is not registered');

const CENSUS = `() => {
  const C = __CTX__, r = C.renderer || C.engine?.renderer;
  const t = C.terrain, lodGeos = t?._chunks ? t._chunks.reduce((s, ch) => s + (ch.geos || []).filter(Boolean).length, 0) : null;
  const byOwner = {}, geoSeen = new Set();
  let objs = 0;
  for (const top of C.scene.children) {
    const key = (top.name || top.type || '?').replace(/-?\\d+(-\\d+)*$/, '#');
    const o = byOwner[key] || (byOwner[key] = { objs: 0, geos: 0 });
    top.traverse((x) => { objs++; o.objs++; if (x.geometry && !geoSeen.has(x.geometry)) { geoSeen.add(x.geometry); o.geos++; } });
  }
  const M = C.machines, list = M?.list || [];
  const kinds = {};
  for (const m of list) { const k = kinds[m.kind] || (kinds[m.kind] = { alive: 0, dead: 0 }); m.alive ? k.alive++ : k.dead++; }
  return { geo: r.info.memory.geometries, tex: r.info.memory.textures, objs, uniqueSceneGeos: geoSeen.size, terrainLodGeos: lodGeos,
    machines: kinds, wrecks: M?.sites?.wrecks?.length ?? null, sitesDisposed: M?.sites?.disposed ?? null, byOwner };
}`;

const LEDGER = `(() => {
  const C = __CTX__, r = C.renderer || C.engine?.renderer;
  if (window.__A90L) return window.__A90L;
  const L = window.__A90L = { phase: 'before', recs: new Map(), next: 1, freed: {}, freedN: 0 };
  const labelOf = (obj, geo) => {
    let o = obj, mach = null, top = null, chunk = null, part = null;
    while (o) {
      if (!mach && o.userData?.machine) mach = o.userData.machine;
      if (!part && o.userData?.part?.name) part = o.userData.part.name;
      if (!chunk && /chunk/i.test(o.name || '')) chunk = o.name;
      if (o.parent === C.scene) top = o.name || o.type;
      o = o.parent;
    }
    const nm = (obj?.name || obj?.type || '?').replace(/\\d+/g, '#');
    if (mach) return 'machine:' + (mach.kind || '?') + '/' + (part || nm) + ' [' + (geo.type || '') + ']';
    if (chunk) return 'chunk:' + chunk + ' [' + nm + ']';
    if (!top) return 'offscene:' + nm + ' [' + (geo.type || '') + ']';
    return String(top).replace(/\\d+/g, '#') + '/' + nm + ' [' + (geo.type || '') + ']';
  };
  const orig = r.renderBufferDirect;
  r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    if (geometry && !geometry.__a90) {
      const id = L.next++;
      geometry.__a90 = id;
      const rec = { label: labelOf(object, geometry), phase: L.phase, ref: new WeakRef(geometry), objRef: object ? new WeakRef(object) : null };
      L.recs.set(id, rec);
      geometry.addEventListener('dispose', function onD() {
        geometry.removeEventListener('dispose', onD);
        const q = L.recs.get(id);
        if (!q) return;
        L.recs.delete(id);
        if (q.phase === 'before' && L.phase !== 'before') { L.freed[q.label] = (L.freed[q.label] || 0) + 1; L.freedN++; }
      });
    }
    return orig.apply(this, arguments);
  };
  return L;
})()`;

const REPORT = `(() => {
  const C = __CTX__, L = window.__A90L;
  const inScene = new Set();
  C.scene.traverse((x) => { if (x.geometry) inScene.add(x.geometry); });
  const grew = {};
  let grewN = 0, grewOut = 0;
  for (const [, q] of L.recs) {
    if (q.phase !== 'run') continue;
    const g = q.ref.deref();
    if (!g) continue;
    const e = grew[q.label] || (grew[q.label] = { n: 0, inScene: 0, outOfScene: 0 });
    e.n++; grewN++;
    if (inScene.has(g)) e.inScene++; else { e.outOfScene++; grewOut++; }
  }
  const top = (o, k) => Object.entries(o).sort((a, b) => (b[1].n ?? b[1]) - (a[1].n ?? a[1])).slice(0, k);
  return { grewN, grewOutOfScene: grewOut, freedN: L.freedN, net: grewN - L.freedN, grew: Object.fromEntries(top(grew, 40)), freed: Object.fromEntries(top(L.freed, 25)) };
})()`;

const assert = `(async () => {
  const __census = ${CENSUS};
  ${LEDGER};
  // the ledger sees every geometry drawn in these frames as the baseline
  for (let i = 0; i < 30; i++) await new Promise((r) => requestAnimationFrame(r));
  const c0 = __census();
  window.__A90L.phase = 'run';
  const res = await ${row.assert};
  const c1 = __census();
  const ledger = ${REPORT};
  const d = (k) => (c1[k] ?? 0) - (c0[k] ?? 0);
  const owners = {};
  for (const k of new Set([...Object.keys(c0.byOwner), ...Object.keys(c1.byOwner)])) {
    const a = c0.byOwner[k] || { objs: 0, geos: 0 }, b = c1.byOwner[k] || { objs: 0, geos: 0 };
    if (a.objs !== b.objs || a.geos !== b.geos) owners[k] = { objs: b.objs - a.objs, geos: b.geos - a.geos };
  }
  const attrib = { before: { ...c0, byOwner: undefined }, after: { ...c1, byOwner: undefined },
    delta: { geo: d('geo'), tex: d('tex'), objs: d('objs'), uniqueSceneGeos: d('uniqueSceneGeos'), terrainLodGeos: d('terrainLodGeos') },
    ownersChanged: owners, ledger,
    note: 'geo = renderer geometries; terrainLodGeos = LOD geometries cached by the terrain; ledger.grew = geometries first drawn during the row and never disposed, by owner (inScene / outOfScene = a leak); ledger.freed = geometries drawn before the row and disposed during it; ledger.net should equal delta.geo' };
  return { pass: res.pass, detail: { ...(res.detail || {}), attrib } };
})()`;

export const GATES = [{
  ...Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(row)).filter(([, v]) => 'value' in v).map(([k, v]) => [k, v.value])),
  id: 'A90-attrib', lane: 'instruments-diag',
  title: 'DIAGNOSTIC: A90-memory-stability unchanged, with a census and a geometry ledger of where the deltas live',
  assert,
}];
