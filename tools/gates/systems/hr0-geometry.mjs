#!/usr/bin/env node
/**
 * HR0, area E's row 0 (the geometry check at blockout; Milestone 2 rule 6): the numbers "True Ground" assumes, measured
 * on the ground in this tree before anything is built against them. Node only, no Chrome. Read from the island recipe's
 * own height field (src/world/island/recipe.js heightAt, the ground the bake draws), the trig pillars, the Sounding
 * Ring, the Roque plug (src/world/sites/layout.js) and the nine walls as data (src/world/settlements/ninewalls-layout.js).
 *
 *   node tools/gates/systems/hr0-geometry.mjs [--json]
 *
 * What it measures:
 *   1. the re-survey's three bearings: from Benchmark 1 at the Alidade's eye height (ground + 1.55 m), which of T1, T2,
 *      the Ring and the great Roque stand clear of the ground and the walls (the lowest visible point of each mark,
 *      the clearance of the sightline over the ground), their ranges and bearings, and which are inside the calima's
 *      visibility (120-180 m: a mark past 120 m may be hidden, past 180 m is hidden). Taken at both B1 points: the
 *      bible's (E 12, N -282, on the Scar's line) and the code's bm-01 (x 19, z 243), which area A reconciles.
 *   2. the Scar's line: each B1 point's distance off the Scar's centreline.
 *   3. the walk (0:21-0:28): the cistern to Ninewalls, length and climb; where the Holds begin on it (src/core/regions.js).
 *   4. Benchmark 1 against Ninewalls: its range from the centre and from the outermost wall.
 * Every number is the tree's at the commit it runs at (it prints `git rev-parse`); nothing here is graded but the
 * bearings clause (>= 3 marks with their top clear, in trade weather), the rest is recorded.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { heightAt } from '../../../src/world/island/recipe.js';
import { TRIG, TRIG_TOP, CISTERN, SCAR, siteById } from '../../../src/world/island/sites.js';
import { ROQUES, BENCHMARKS, site } from '../../../src/world/sites/layout.js';
import * as NW from '../../../src/world/settlements/ninewalls-layout.js';
import { RegionMap } from '../../../src/core/regions.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const JSON_OUT = process.argv.includes('--json');
const commit = (() => { try { return execFileSync('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return '?'; } })();
const dirty = (() => { try { return execFileSync('git', ['-C', REPO, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim().length > 0; } catch { return null; } })();

const EYE = 1.55;            // the Alidade at her eye (the M1.3h bench: the wrist 0.10 m in front of the face)
const VIS = { near: 120, far: 180 };
const D2R = Math.PI / 180;
const r1 = (v) => Math.round(v * 10) / 10;
const bearing = (a, b) => ((Math.atan2(b.x - a.x, -(b.z - a.z)) / D2R) + 360) % 360;

/** The wall a plan point is inside, with its top (the centre's ground + the wall height), or null. */
// the walls as data may still be empty at a commit (settlements' seam is committed empty-but-typed first)
const WALLS = Array.isArray(NW.WALLS) ? NW.WALLS : [];
const nw = siteById('ninewalls');
const CENTRE = NW.CENTRE || { x: nw.x, z: nw.z };
const OUTER_R = Number.isFinite(NW.OUTER_R) ? NW.OUTER_R : null;
const inSpan = NW.inSpan || (() => false), bearingOf = NW.bearingOf || (() => 0);
const scarDistance = (x, z) => {
  const ax = SCAR.a.x, az = SCAR.a.z, dx = SCAR.b.x - ax, dz = SCAR.b.z - az, L = Math.hypot(dx, dz);
  return Math.abs((x - ax) * dz - (z - az) * dx) / L;
};
const centreG = heightAt(CENTRE.x, CENTRE.z);
function wallAt(x, z) {
  for (const w of WALLS) {
    const rr = Math.hypot(x - w.c.x, z - w.c.z);
    if (Math.abs(rr - w.r) <= w.t / 2 && inSpan(w, bearingOf(x, z, w.c))) return { id: w.id, top: Math.max(heightAt(x, z), centreG) + w.h };
  }
  return null;
}

/** Sightline from eye e to point t (both {x, y, z}): the lowest clearance over ground and walls, and what blocks it. */
function ray(e, t, step = 0.5) {
  const L = Math.hypot(t.x - e.x, t.z - e.z), n = Math.max(2, Math.ceil(L / step));
  let minClear = Infinity, at = null, by = null;
  for (let i = 1; i < n; i++) {
    const k = i / n, x = e.x + (t.x - e.x) * k, z = e.z + (t.z - e.z) * k, y = e.y + (t.y - e.y) * k;
    if (L * k < 1.0 || L * (1 - k) < 0.6) continue;   // her own footing; the mark's own face
    const g = heightAt(x, z), w = wallAt(x, z), top = Math.max(g, w ? w.top : -Infinity);
    const c = y - top;
    if (c < minClear) { minClear = c; at = r1(L * k); by = w && w.top > g ? w.id : 'ground'; }
  }
  return { clear: minClear > 0, minClear: r1(minClear), at, by };
}

/** The lowest visible height of a mark (0.5 m steps from its foot to its top), or null if none is. */
function lowestVisible(e, m) {
  for (let h = 0; h <= m.h + 1e-6; h += 0.5) if (ray(e, { x: m.x, y: m.g + h, z: m.z }).clear) return r1(h);
  return null;
}

function marks() {
  const out = [];
  for (const id of ['T1', 'T2']) {
    const t = TRIG.find((r) => r.id === id);
    out.push({ id, name: t.name, x: t.x, z: t.z, g: heightAt(t.x, t.z), h: TRIG_TOP });
  }
  const ring = site('sounding-ring');
  out.push({ id: 'Ring', name: 'Sounding Ring', x: ring.x, z: ring.z, g: heightAt(ring.x, ring.z), h: 32.8 });
  const plug = ROQUES.find((r) => r.id === 'roque-plug');
  out.push({ id: 'Roque', name: 'the great Roque (the plug)', x: plug.x, z: plug.z, g: heightAt(plug.x, plug.z), h: plug.height });
  return out;
}

function atB1(name, p) {
  const g = heightAt(p.x, p.z), e = { x: p.x, y: g + EYE, z: p.z };
  const rows = marks().map((m) => {
    const top = ray(e, { x: m.x, y: m.g + m.h, z: m.z });
    const range = Math.hypot(m.x - p.x, m.z - p.z);
    const low = lowestVisible(e, m);
    return {
      mark: m.id, range: r1(range), bearing: r1(bearing(p, m)), topClear: top.clear, topClearance: top.minClear,
      blockedBy: top.clear ? null : top.by, blockAt: top.at, lowestVisible: low, height: m.h, eyeNeeded: undefined,
      calima: range <= VIS.near ? 'visible' : range <= VIS.far ? 'at the edge' : 'hidden',
    };
  });
  const clear = rows.filter((r) => r.topClear).map((r) => r.mark);
  const set = clear.includes('T1') && clear.includes('T2') && (clear.includes('Ring') || clear.includes('Roque'));
  for (const r of rows) if (!r.topClear) r.eyeNeeded = eyeNeeded(p, marks().find((m) => m.id === r.mark));
  return {
    nearestPass: set ? null : nearestGood(p),
    name, x: r1(p.x), z: r1(p.z), en: [r1(p.x), r1(-p.z)], ground: r1(g), eye: r1(g + EYE),
    scarOff: r1(scarDistance(p.x, p.z)), fromNinewalls: r1(Math.hypot(p.x - CENTRE.x, p.z - CENTRE.z)),
    fromOuterWall: OUTER_R == null ? null : r1(Math.hypot(p.x - CENTRE.x, p.z - CENTRE.z) - OUTER_R),
    marks: rows, clear, threeBearings: set,
    inCalima: rows.filter((r) => r.topClear && r.calima !== 'hidden').map((r) => `${r.mark} (${r.calima})`),
  };
}

/** The eye height (above the ground at B1) at which a hidden mark's top first clears, up to 6 m. */
function eyeNeeded(p, m) {
  const g = heightAt(p.x, p.z);
  for (let h = EYE; h <= 6 + 1e-6; h += 0.05) if (ray({ x: p.x, y: g + h, z: p.z }, { x: m.x, y: m.g + m.h, z: m.z }).clear) return r1(h);
  return null;
}

/** The nearest standing point (0.5 m grid, within 20 m) where T1, T2 and one of the Ring or the Roque all clear. */
function nearestGood(p) {
  const M = marks(), need = (e) => {
    const ok = (id) => ray(e, (() => { const m = M.find((q) => q.id === id); return { x: m.x, y: m.g + m.h, z: m.z }; })()).clear;
    return ok('T1') && ok('T2') && (ok('Ring') || ok('Roque'));
  };
  for (let r = 0.5; r <= 20; r += 0.5) {
    let best = null;
    for (let a = 0; a < 360; a += Math.max(2, 90 / r)) {
      const x = p.x + Math.sin(a * D2R) * r, z = p.z - Math.cos(a * D2R) * r;
      if (need({ x, y: heightAt(x, z) + EYE, z })) { const off = scarDistance(x, z); if (!best || off < best.scarOff) best = { x: r1(x), z: r1(z), en: [r1(x), r1(-z)], from: r, bearingFromB1: Math.round(a), scarOff: r1(off), ground: r1(heightAt(x, z)) }; }
    }
    if (best) return best;
  }
  return null;
}

function walk() {
  const a = { x: CISTERN.x, z: CISTERN.z }, b = { x: CENTRE.x, z: CENTRE.z };
  const L = Math.hypot(b.x - a.x, b.z - a.z), map = new RegionMap().build();
  let up = 0, down = 0, prev = heightAt(a.x, a.z), maxSlope = 0, holdsAt = null;
  for (let s = 1; s <= L; s += 1) {
    const k = s / L, x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k, h = heightAt(x, z);
    const d = h - prev; if (d > 0) up += d; else down -= d;
    maxSlope = Math.max(maxSlope, Math.abs(d));
    if (holdsAt == null && map.regionAt(x, z) === 'holds') holdsAt = s;
    prev = h;
  }
  return { from: 'the cistern', to: 'Ninewalls (centre)', straight: r1(L), climb: r1(heightAt(b.x, b.z) - heightAt(a.x, a.z)),
    totalUp: r1(up), totalDown: r1(down), steepest: `${r1(Math.atan(maxSlope) / D2R)} deg over 1 m`, holdsBeginAt: holdsAt };
}

const bible = { x: 12, z: 282 };
const bm01 = BENCHMARKS.find((b) => b.id === 'bm-01');
const report = {
  row: 'HR0 geometry check (area E, True Ground)', commit, dirty, eye: EYE, calimaVisibility: VIS,
  b1: [atB1('B1 bible (E 12, N -282)', bible), atB1(`bm-01 in src/world/sites/layout.js (x ${bm01.x}, z ${bm01.z})`, { x: bm01.x, z: bm01.z }),
    // wave 0's code point, before area A's reconciliation (the brief: about 30 m off the Scar's line)
    atB1('bm-01 before M2 wave 1 (x 19, z 243)', { x: 19, z: 243 })],
  scar: { a: SCAR.a, b: SCAR.b, width: SCAR.width },
  walk: walk(),
  ninewalls: { centre: { x: r1(CENTRE.x), z: r1(CENTRE.z), ground: r1(centreG) }, outerWall: OUTER_R == null ? null : r1(OUTER_R), walls: WALLS.length, siteH: nw?.h },
};

if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`HR0 geometry check at ${commit}${dirty ? ' (DIRTY tree)' : ' (clean tree)'}; eye ground + ${EYE} m`);
  for (const b of report.b1) {
    console.log(`\n${b.name}: ground ${b.ground} m; ${b.scarOff} m off the Scar's centreline; ${b.fromNinewalls} m from Ninewalls' centre${b.fromOuterWall == null ? '' : `, ${b.fromOuterWall} m outside its outer wall`}`);
    for (const m of b.marks) {
      console.log(`  ${m.mark.padEnd(6)} ${String(m.range).padStart(6)} m at ${String(m.bearing).padStart(5)} deg  top ${m.topClear ? 'CLEAR' : 'HIDDEN'} (clearance ${m.topClearance} m${m.blockedBy ? `, blocked by ${m.blockedBy} at ${m.blockAt} m` : ''}); lowest visible ${m.lowestVisible == null ? 'none' : `${m.lowestVisible} of ${m.height} m`}; calima: ${m.calima}`);
    }
    for (const m of b.marks) if (!m.topClear) console.log(`  ${m.mark}: its top clears at an eye ${m.eyeNeeded == null ? 'over 6 m' : `${m.eyeNeeded} m`} above the ground here`);
    console.log(`  three bearings (T1, T2 and the Ring or the Roque, tops clear, trade weather): ${b.threeBearings ? 'PASS' : 'FAIL'} [${b.clear.join(', ') || 'none'}]`);
    if (b.nearestPass) console.log(`  nearest point where all three clear: ${b.nearestPass.from} m away at bearing ${b.nearestPass.bearingFromB1} (E ${b.nearestPass.en[0]}, N ${b.nearestPass.en[1]}), ${b.nearestPass.scarOff} m off the Scar's line, ground ${b.nearestPass.ground} m`);
    else if (!b.threeBearings) console.log('  no point within 20 m sees all three');
    console.log(`  in calima (120-180 m): ${b.inCalima.join(', ') || 'none'}`);
  }
  const w = report.walk;
  console.log(`\nthe walk: ${w.from} to ${w.to} ${w.straight} m straight, climb ${w.climb} m (up ${w.totalUp}, down ${w.totalDown}), steepest ${w.steepest}; the Holds begin ${w.holdsBeginAt} m along`);
}
