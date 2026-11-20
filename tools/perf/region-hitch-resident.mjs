#!/usr/bin/env node
/**
 * RESIDENCY PER PLACE (Milestone 3 debt D9; area F's EF2; the inputs of A-region-hitch's "stand-ins at their caps").
 * Node only: no browser. Read from the regions seam's DATA (src/core/regions.js: each region's `files`, `cast`,
 * `approach` and `standIn`) and from the shipped files (tools/tier0/budgets.mjs readAssets: every GLB's images and every
 * loose image, identical images counted once, resident bytes as the texture ledger counts them).
 *
 *   node tools/perf/region-hitch-resident.mjs [--json <out>]
 *
 * A texture belongs to a region when its file is under one of the region's `files` prefixes (public/...) or is one of
 * its `cast` GLBs (the game's own list, e.g. the Holds' HOLDS_CAST less the archetypes staged at boot); everything else
 * is ALWAYS resident (the boot set: the Pans, Brea, the Instruments, the ground layers, the people staged at boot). A
 * region not built yet is held at its `standIn.residentMb` (the Malpais: 16 MB), or its files on disk if they are more.
 *
 * The four places of the M3 exit (<= 175 MB at each): Saltrow, Ninewalls, the Kiln Yards (on foot) and 60 m over the
 * Pans (in the air, at the Sounding Ring). At each, two sums:
 *   byRegion   the always set + every region she is in or approaching there (the seam's approach for the mode): what is
 *              resident once a region's files leave on `depart` (the loader's unload; not wired in the game yet)
 *   today      (M3 wave 2) what the GAME holds there: the always set + every region approached on the hour's path so far
 *              (Saltrow, Ninewalls, the Yards, then the flight home) that the seam has NOT departed, read at the worst of
 *              the hysteresis (a region leaves only HYSTERESIS_M past its approach: depth < -(approach + 20 m)). The engine's
 *              loader unloads a region's rows on depart and the Holds' cast follows the tracker (holds.js), so a departed
 *              region's files are out. A place may carry `points` (the Yards: the four wellheads, B5, the tube's Brazier):
 *              the worst of them is the place's
 *   noUnload   the same path with nothing ever unloaded (wave 1's 'today', kept to show what the depart buys)
 * and, apart, the M3 plan's lines for things not on disk yet (M3-BRIEFS §12, resident at the Yards: the kite 2, four
 * kinds 13, weapons 4, fauna 3, one rung 5): `withPlan` adds them to `today`.
 * Megabytes are MiB (resident memory), as the texture ledger's.
 */
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readAssets } from '../tier0/budgets.mjs';
import { residentBytes } from '../tier0/lib/glb.mjs';
import { MB } from '../tier0/lib/files.mjs';
import { REGIONS, RegionMap, approachOf, HYSTERESIS_M } from '../../src/core/regions.js';
import { WELLHEADS, BENCH_B5 } from '../../src/world/sites/kilnyards-layout.js';
import { TUBE_SHELTER } from '../../src/world/sites/malpais-layout.js';
import { siteById } from '../../src/world/island/sites.js';
import { GUILD_STUD } from '../../src/world/settlements/saltrow-layout.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const CAP_MB = 175;
const mb = (b) => Math.round((b / MB) * 100) / 100;

/** The M3 plan's resident lines for what is not on disk yet (M3-BRIEFS §12, "resident MB at the Yards"). */
export const PLAN_LINES = Object.freeze([
  { id: 'kite', label: 'B: the Survey Kite and the line-posts', mb: 2 },
  { id: 'kinds', label: 'C: Kiln, Spindle, Davit, Sonde', mb: 13 },
  { id: 'weapons', label: 'D: nets, the Dust Pot', mb: 4 },
  { id: 'fauna', label: 'H: fauna', mb: 3 },
  { id: 'rung', label: 'G: one rung worn', mb: 5 },
]);

/** The four places (engine x, z) and how she is there. */
export function places() {
  const yards = siteById('kiln-yards'), ring = siteById('sounding-ring'), nw = siteById('ninewalls');
  return [
    { id: 'saltrow', label: 'Saltrow (the guild-house stud)', x: GUILD_STUD.x, z: GUILD_STUD.z, mode: 'walk' },
    { id: 'ninewalls', label: 'Ninewalls', x: nw.x, z: nw.z, mode: 'walk' },
    { id: 'kiln-yards', label: 'the Kiln Yards', x: yards.x, z: yards.z, mode: 'walk',
      points: [...WELLHEADS.map((w) => ({ id: w.id, x: w.x, z: w.z })), { id: 'B5', x: BENCH_B5.x, z: BENCH_B5.z }, { id: 'tube-brazier', x: TUBE_SHELTER.brazier.x, z: TUBE_SHELTER.brazier.z }] },
    { id: 'flight-pans', label: '60 m over the Pans (the Sounding Ring)', x: ring.x, z: ring.z, mode: 'flight', altitude: 60 },
  ];
}

/** A region's cast GLBs (public/...), from the game's own lists. */
async function castFiles(root, cast) {
  if (!cast) return [];
  const listOf = async (mod, name) => {
    const abs = path.join(root, mod);
    if (!existsSync(abs)) throw new Error(`${mod} is missing`);
    const m = await import(pathToFileURL(abs).href);
    if (!Array.isArray(m[name])) throw new Error(`${mod} has no array export ${name}`);
    return m[name].map(String);
  };
  let ids = await listOf(cast.module, cast.export);
  for (const x of cast.except || []) { const no = new Set(await listOf(x.module, x.export)); ids = ids.filter((id) => !no.has(id)); }
  return ids.map((id) => path.posix.join('public', cast.file.replace('{}', id)));
}

/**
 * The ledger. `assets` and `map` may be handed in (tests). Returns { regions: { id: { mb, files, standIn } }, always,
 * places: [{ id, regions, byRegion, today, withPlan, top5, pass }], ... }.
 */
export async function residentLedger({ root = REPO, assets = null, map = null, regions = REGIONS } = {}) {
  const A = assets || readAssets(root);
  const M = map || new RegionMap({ regions }).build();
  const owner = new Map();   // public file -> region id
  const regionInfo = {};
  for (const r of regions) {
    const cast = await castFiles(root, r.cast);
    for (const f of cast) owner.set(f, r.id);
    regionInfo[r.id] = { prefixes: r.files.map((p) => `public/${p}`), cast, bytes: 0, files: new Map(), standIn: null, built: r.built };
  }
  const ownerOf = (file) => {
    if (owner.has(file)) return owner.get(file);
    for (const r of regions) if (regionInfo[r.id].prefixes.some((p) => file.startsWith(p))) return r.id;
    return null;
  };
  let always = 0;
  const alwaysFiles = new Map();
  const seen = new Set();
  for (const t of A.textures) {
    if (seen.has(t.sha1)) continue;
    seen.add(t.sha1);
    const b = residentBytes(t);
    const id = ownerOf(t.file);
    if (id) { regionInfo[id].bytes += b; regionInfo[id].files.set(t.file, (regionInfo[id].files.get(t.file) || 0) + b); }
    else { always += b; alwaysFiles.set(t.file, (alwaysFiles.get(t.file) || 0) + b); }
  }
  for (const r of regions) {
    const I = regionInfo[r.id];
    // (M3 wave 2) a region with a plan line is held at the larger of its files and the line until it is built: its first
    // files (area A's ground layers) are not the whole region
    I.disk = I.bytes;
    if (r.standIn && I.bytes < r.standIn.residentMb * MB) { I.standIn = r.standIn.residentMb; const rest = r.standIn.residentMb * MB - I.bytes; I.bytes += rest; I.files.set(`(stand-in: the plan's line for ${r.id}, less its files on disk)`, rest); }
  }
  const nearAt = (p) => regions.filter((r) => M.regionAt(p.x, p.z) === r.id || M.depth(r.id, p.x, p.z) >= -approachOf(r, p.mode)).map((r) => r.id);
  // the worst of the hysteresis: a region approached before is still held until it is HYSTERESIS_M past its approach
  const heldAt = (p, ids) => ids.filter((id) => { const r = regions.find((q) => q.id === id); return M.regionAt(p.x, p.z) === id || M.depth(id, p.x, p.z) >= -(approachOf(r, p.mode) + HYSTERESIS_M); });
  const planMb = PLAN_LINES.reduce((s, l) => s + l.mb, 0);
  const out = [];
  const sofar = new Set();
  const sum = (ids) => always + ids.reduce((s, id) => s + regionInfo[id].bytes, 0);
  for (const p of places()) {
    const near = nearAt(p);
    for (const id of near) sofar.add(id);
    // the game's set at the place: the worst point of it (the Yards: its wellheads, B5, the tube's Brazier)
    let held = heldAt(p, [...sofar]), worstAt = null;
    for (const q of p.points || []) { const h = heldAt({ ...q, mode: p.mode }, [...sofar]); if (sum(h) > sum(held)) { held = h; worstAt = q.id; } }
    const lines = [...alwaysFiles.entries(), ...held.flatMap((id) => [...regionInfo[id].files.entries()].map(([f, b]) => [`${f} [${id}]`, b]))]
      .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, b]) => ({ file: f, mb: mb(b) }));
    const byRegion = mb(sum(near)), today = mb(sum(held)), noUnload = mb(sum([...sofar]));
    out.push({ id: p.id, label: p.label, mode: p.mode, region: M.regionAt(p.x, p.z), regions: near, regionsSoFar: [...sofar], regionsHeld: held, worstPoint: worstAt,
      byRegion, today, noUnload, withPlan: Math.round((today + planMb) * 100) / 100, byRegionWithPlan: Math.round((byRegion + planMb) * 100) / 100,
      noUnloadWithPlan: Math.round((noUnload + planMb) * 100) / 100,
      overMb: Math.max(0, Math.round((today + planMb - CAP_MB) * 100) / 100), top5: lines,
      pass: { byRegion: byRegion <= CAP_MB, today: today <= CAP_MB, withPlan: today + planMb <= CAP_MB, byRegionWithPlan: byRegion + planMb <= CAP_MB } });
  }
  return {
    capMb: CAP_MB, alwaysMb: mb(always), planMb,
    regions: Object.fromEntries(regions.map((r) => [r.id, { mb: mb(regionInfo[r.id].bytes), standIn: regionInfo[r.id].standIn, built: r.built,
      onDiskMb: mb(regionInfo[r.id].disk), files: regionInfo[r.id].files.size, cast: regionInfo[r.id].cast.length, approach: { walk: approachOf(r, 'walk'), flight: approachOf(r, 'flight') } }])),
    places: out,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = process.argv.slice(2);
  const j = args.indexOf('--json');
  const L = await residentLedger();
  console.log(`resident textures per place (MiB, cap ${L.capMb}); always resident ${L.alwaysMb}; M3 plan lines not on disk ${L.planMb}`);
  for (const [id, r] of Object.entries(L.regions)) console.log(`  region ${id.padEnd(9)} ${String(r.mb).padStart(7)} MB${r.standIn ? ' (stand-in)' : ''}  ${r.files} files, cast ${r.cast}; approach ${r.approach.walk} m walk / ${r.approach.flight} m flight`);
  for (const p of L.places) {
    console.log(`${p.label} [${p.region}, ${p.mode}]: the game holds ${p.today} (${p.regionsHeld.join('+')}${p.worstPoint ? `, worst at ${p.worstPoint}` : ''}), with the plan lines ${p.withPlan}: ${p.pass.withPlan ? 'PASS' : `FAIL (over by ${p.overMb})`}; by region ${p.byRegion} (${p.regions.join('+')}); nothing unloaded ${p.noUnload} (${p.regionsSoFar.join('+')}), with the plan lines ${p.noUnloadWithPlan}`);
    for (const l of p.top5) console.log(`    ${String(l.mb).padStart(6)}  ${l.file}`);
  }
  if (j >= 0) writeFileSync(args[j + 1], JSON.stringify(L, null, 1));
}
