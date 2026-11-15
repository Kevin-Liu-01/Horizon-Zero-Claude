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

const assert = `(async () => {
  const __census = ${CENSUS};
  const c0 = __census();
  const res = await ${row.assert};
  const c1 = __census();
  const d = (k) => (c1[k] ?? 0) - (c0[k] ?? 0);
  const owners = {};
  for (const k of new Set([...Object.keys(c0.byOwner), ...Object.keys(c1.byOwner)])) {
    const a = c0.byOwner[k] || { objs: 0, geos: 0 }, b = c1.byOwner[k] || { objs: 0, geos: 0 };
    if (a.objs !== b.objs || a.geos !== b.geos) owners[k] = { objs: b.objs - a.objs, geos: b.geos - a.geos };
  }
  const attrib = { before: { ...c0, byOwner: undefined }, after: { ...c1, byOwner: undefined },
    delta: { geo: d('geo'), tex: d('tex'), objs: d('objs'), uniqueSceneGeos: d('uniqueSceneGeos'), terrainLodGeos: d('terrainLodGeos') },
    ownersChanged: owners,
    note: 'geo = renderer geometries; terrainLodGeos = LOD geometries cached by the terrain (kept for the session, never disposed); uploaded geometries outside the scene = geo - uniqueSceneGeos' };
  return { pass: res.pass, detail: { ...(res.detail || {}), attrib } };
})()`;

export const GATES = [{
  ...Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(row)).filter(([, v]) => 'value' in v).map(([k, v]) => [k, v.value])),
  id: 'A90-attrib', lane: 'instruments-diag',
  title: 'DIAGNOSTIC: A90-memory-stability unchanged, with a census of where the geometry and object deltas live',
  assert,
}];
