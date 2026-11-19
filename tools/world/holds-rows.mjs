/**
 * THE HOLDS' ROWS IN NODE (area A, M2 wave 1; M2 briefs §4): HG0, the geometry check at blockout, and HG1, the Scar,
 * read off the island recipe with no browser. Every number is read from the same height function the game bakes
 * (`recipe.heightAt`) and, where the game reads the bake, from the baked grid's bilinear (`terrain.getHeight`).
 *
 *   node tools/world/holds-rows.mjs                 the rows, as text
 *   node tools/world/holds-rows.mjs --json <file>   also the record as JSON
 *   node tools/world/holds-rows.mjs --base <tree>   also the terrain change against another tree's recipe (a detached
 *                                                   worktree at the commit before): every bake node that moved, and
 *                                                   whether all of them lie inside the blockout's FOOTPRINT
 *
 * Bands marked * are starting values (M2 briefs §13), confirmed or replaced on this tool's first run.
 * Frame: the bible's (E, N); engine x = E, z = -N.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureMacro, heightAt, biomesAt, BIOMES } from '../../src/world/island/recipe.js';
import { SITES, TRIG, REST, siteById } from '../../src/world/island/sites.js';
import { GRID } from '../../src/world/island/bake.js';
import { BENCHMARKS } from '../../src/world/sites/layout.js';
import { SCAR_LINE, PLUMB_TERRACE, HERD_SLOPE, BARRANCO, FOOTPRINT, scarFrame, scarPoint, scarFloor } from '../../src/world/holds/blockout.js';

const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;

ensureMacro();
const H = (e, n) => heightAt(e, -n);

/* the bake, as the game reads it: the render grid's nodes, bilinear (terrain.getHeight) */
const side = GRID.side, step = GRID.step, half = GRID.half;
const bakeCache = new Map();
function node(ix, iz) {
  const k = iz * side + ix;
  let v = bakeCache.get(k);
  if (v === undefined) { v = heightAt(ix * step - half, iz * step - half); bakeCache.set(k, v); }
  return v;
}
function bake(e, n) {
  const x = e, z = -n;
  const fx = (x + half) / step, fz = (z + half) / step;
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const a = node(ix, iz), b = node(ix + 1, iz), c = node(ix, iz + 1), d = node(ix + 1, iz + 1);
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz;
}

const rec = { tool: 'tools/world/holds-rows.mjs', rows: {} };
const out = [];
const say = (s) => { out.push(s); console.log(s); };
const verdict = (ok) => (ok ? 'PASS' : 'FAIL');

/* ======================================================================== HG0 */
say('HG0  the geometry check at blockout');

/* 1. the site table against BIBLE §3.4 */
const BIBLE = {
  saltrow: [-267, -229], ninewalls: [-11, -213], jameo: [112, -160], 'kiln-yards': [219, -27], 'organ-shelf': [-219, -341],
  scarA: [251, -43], scarB: [-91, -384], B1: [12, -282], T1: [-219, -341],
};
const bm1 = BENCHMARKS.find((b) => b.id === 'bm-01');
const siteRows = [];
const cmp = (name, code, bible, note = '') => {
  const d = Math.hypot(code[0] - bible[0], code[1] - bible[1]);
  siteRows.push({ name, code, bible, d: r2(d), note });
  say(`  site ${name.padEnd(10)} code (${code.map(r1).join(', ')})  bible (${bible.join(', ')})  ${r2(d)} m${note ? `  ${note}` : ''}`);
};
for (const id of ['saltrow', 'ninewalls', 'jameo', 'kiln-yards', 'organ-shelf']) { const s = siteById(id); cmp(id, [s.e, s.n], BIBLE[id]); }
cmp('scar a', [SCAR_LINE.a.e, SCAR_LINE.a.n], BIBLE.scarA);
cmp('scar b', [SCAR_LINE.b.e, SCAR_LINE.b.n], BIBLE.scarB);
cmp('B1', [bm1.x, -bm1.z], BIBLE.B1);
const t1 = TRIG.find((t) => t.id === 'T1'), t2 = TRIG.find((t) => t.id === 'T2');
cmp('T1', [t1.e, t1.n], BIBLE.T1, 'the bible gives T1 the Organ Shelf\'s point; the code stands it on the Shelf 35 m ESE: RULING');
say(`  site T2         code (${t2.e}, ${t2.n})  bible: "Ninewalls Rise", no coordinate; ${r1(Math.hypot(t2.e - BIBLE.ninewalls[0], t2.n - BIBLE.ninewalls[1]))} m from Ninewalls, h ${r1(H(t2.e, t2.n))}`);
rec.rows.siteTable = siteRows;

/* 2. the Scar's two ends and B1 on one line; B1 where survey.js will set its pad (the flattest ground within r) */
function padAt(b) {
  let bx = b.x, bz = b.z, bs = Infinity;
  const st = b.r / 3;
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
    const x = b.x + i * st, z = b.z + j * st, h = bake(x, -z);
    if (h < 0.5) continue;
    const s = Math.abs(bake(x + 1.3, -z) - bake(x - 1.3, -z)) + Math.abs(bake(x, -(z + 1.3)) - bake(x, -(z - 1.3))) + (i * i + j * j) * 0.004;
    if (s < bs) { bs = s; bx = x; bz = z; }
  }
  return { x: bx, z: bz };
}
const pad = padAt(bm1);
const fB1 = scarFrame(pad.x, -pad.z), fB1bible = scarFrame(...BIBLE.B1);
const nwB1 = Math.hypot(pad.x - BIBLE.ninewalls[0], -pad.z - BIBLE.ninewalls[1]);
say(`  B1 pad at (${r2(pad.x)}, ${r2(-pad.z)}): ${r2(Math.abs(fB1.v))} m off the Scar's centreline, ${r1(fB1.u)} m along it; the bible's point ${r2(Math.abs(fB1bible.v))} m off; ${r1(nwB1)} m from Ninewalls (bible "70 m south")`);
rec.rows.b1 = { pad: { e: r2(pad.x), n: r2(-pad.z) }, offLine: r2(Math.abs(fB1.v)), along: r1(fB1.u), fromNinewalls: r1(nwB1), bibleOffLine: r2(Math.abs(fB1bible.v)) };

/* 3. the Scar's ground before the cut: the cross-fall and what a floor LEVEL across would cut (the ruling) */
// the profile's own least-squares fit (scarFloor + FLOOR_CUT) is the natural centre and cross-fall of each station
const cutRows = [];
let worstCut = 0;
for (let i = 0; i < 10; i++) {
  const u = SCAR_LINE.len * (i + 0.5) / 10;
  const c = scarFloor(u, 0), s = (scarFloor(u, 1) - scarFloor(u, -1)) / 2;
  const cut = Math.abs(s) * SCAR_LINE.half;          // a level floor at the centre's height, at the floor's edges
  worstCut = Math.max(worstCut, cut);
  cutRows.push({ u: r1(u), crossFallDeg: r1(Math.atan(Math.abs(s)) * 180 / Math.PI), levelCut: r2(cut) });
}
say(`  Scar cross-fall at 10 stations (deg): ${cutRows.map((r) => r.crossFallDeg).join(' ')}`);
say(`  a floor level across would cut/fill at its edges (m): ${cutRows.map((r) => r.levelCut).join(' ')} (worst ${r2(worstCut)}): the blockout planes it with the cross-fall instead: RULING`);
const jam = siteById('jameo'), fJ = scarFrame(jam.e, jam.n);
say(`  the Jameo stands ${r1(Math.abs(fJ.v))} m off the Scar's centreline (${r1(fJ.u)} m along): inside its berm band (${SCAR_LINE.half - SCAR_LINE.BERM_IN}-${SCAR_LINE.half + SCAR_LINE.BERM_IN + SCAR_LINE.BERM_OUT} m); h ${r2(H(jam.e, jam.n))} (stated ${jam.h}): RULING`);
const shelfEnd = scarFrame(-110, -380);
say(`  the Scar's south-west end runs into the Organ Shelf's east foot: organ-9 (E -110, N -380) is ${r1(Math.abs(shelfEnd.v))} m off the line, ${r1(shelfEnd.u - SCAR_LINE.len)} m past its end`);
rec.rows.scarGround = { stations: cutRows, worstLevelCut: r2(worstCut), jameo: { off: r1(Math.abs(fJ.v)), along: r1(fJ.u), h: r2(H(jam.e, jam.n)) } };

/* 4. Ninewalls' pad: its height, and what a level pad of radius R would cut and fill (area B gives OUTER_R) */
let OUTER_R = 0;
try { OUTER_R = (await import('../../src/world/settlements/ninewalls-layout.js')).OUTER_R || 0; } catch { /* not in this tree */ }
const nw = siteById('ninewalls');
const nwh = H(nw.e, nw.n);
const padRows = [];
for (const R of [20, 30, 40, 50, 60, 80]) {
  let mn = Infinity, mx = -Infinity, smax = 0;
  for (let a = 0; a < 360; a += 5) {
    const ca = Math.cos(a * Math.PI / 180), sa = Math.sin(a * Math.PI / 180);
    for (let r = 2; r <= R; r += 2) {
      const h = H(nw.e + ca * r, nw.n + sa * r); mn = Math.min(mn, h); mx = Math.max(mx, h);
      const g = Math.abs(H(nw.e + ca * (r + 1), nw.n + sa * (r + 1)) - H(nw.e + ca * (r - 1), nw.n + sa * (r - 1))) / 2;
      smax = Math.max(smax, g);
    }
  }
  padRows.push({ R, min: r1(mn), max: r1(mx), cut: r1(mx - nw.h), fill: r1(nw.h - mn), maxSlopeDeg: r1(Math.atan(smax) * 180 / Math.PI) });
}
say(`  Ninewalls h ${r2(nwh)} (stated ${nw.h}, bar +-3): ${verdict(Math.abs(nwh - nw.h) <= 3)}; area B's OUTER_R in this tree: ${OUTER_R || 'not given (0)'}`);
for (const p of padRows) say(`    within ${String(p.R).padStart(2)} m: ground ${p.min}-${p.max} m; a level pad at ${nw.h} cuts ${p.cut} and fills ${p.fill}; steepest ${p.maxSlopeDeg} deg`);
say('    the ground falls to the west-south-west across the site: room for nine walls is terraces (each crescent a riser), not a pad: RULING with area B');
rec.rows.ninewalls = { h: r2(nwh), stated: nw.h, outerR: OUTER_R, radii: padRows };

/* 5. the terrace above Ninewalls: a clear line from the Plumb's lamp to the slope the herd climbs */
const T = PLUMB_TERRACE;
const th = H(T.e, T.n);
const lamp = { e: T.e, n: T.n, y: th + T.lamp };
function clear(a, b) {   // terrain only (no props): does the segment a-b stay over the ground
  const L = Math.hypot(b.e - a.e, b.n - a.n), n = Math.ceil(L / 0.5);
  for (let k = 2; k < n - 1; k++) {
    const t = k / n, e = a.e + (b.e - a.e) * t, nn = a.n + (b.n - a.n) * t, y = a.y + (b.y - a.y) * t;
    if (bake(e, nn) > y) return false;
  }
  return true;
}
const slopeRows = [];
const [s0, s1] = HERD_SLOPE, sl = Math.hypot(s1.e - s0.e, s1.n - s0.n);
let seenStand = 0, seenCrouch = 0, nS = 0;
for (let d = 0; d <= sl; d += 5) {
  const e = s0.e + (s1.e - s0.e) * d / sl, n = s0.n + (s1.n - s0.n) * d / sl, g = bake(e, n);
  const st = clear(lamp, { e, n, y: g + 1.6 }), cr = clear(lamp, { e, n, y: g + 1.0 });
  seenStand += st; seenCrouch += cr; nS++;
  slopeRows.push({ d, h: r1(g), dist: r1(Math.hypot(e - T.e, n - T.n)), standing: st, crouched: cr });
}
const climb = bake(s1.e, s1.n) - bake(s0.e, s0.n);
say(`  terrace (E ${T.e}, N ${T.n}) at h ${r1(th)}, lamp ${T.lamp} m up; the herd's slope ${r1(sl)} m long, climbing ${r1(climb)} m, ${r1(slopeRows[0].dist)}-${r1(slopeRows[slopeRows.length - 1].dist)} m from the lamp`);
say(`    the lamp sees Brea standing at ${seenStand} of ${nS} points on the slope, crouched at ${seenCrouch} of ${nS} (terrain only: the hulls are the cover; bar* 90 % standing; the points it misses are under the bench's brow, ${slopeRows.filter((q) => !q.standing).map((q) => q.dist).join(", ") || "none"} m from the lamp: dead ground for an Undercut): ${verdict(seenStand >= 0.9 * nS)}`);
rec.rows.terrace = { e: T.e, n: T.n, h: r1(th), lamp: T.lamp, slopeLen: r1(sl), climb: r1(climb), seenStanding: seenStand, seenCrouched: seenCrouch, points: nS, samples: slopeRows };

/* 6. the walks: Saltrow (the cistern) to Ninewalls, to B1 and to the Malpais edge, on a 2 m grid with the nav rule */
const malpEdge = (() => {
  const k = siteById('kiln-yards'), w = new Float64Array(6);
  const L = Math.hypot(k.e - nw.e, k.n - nw.n);
  for (let d = 0; d < L; d += 2) {
    const e = nw.e + (k.e - nw.e) * d / L, n = nw.n + (k.n - nw.n) * d / L;
    biomesAt(e, -n, w);
    if (w[2] > w[1]) return { e: r1(e), n: r1(n) };
  }
  return { e: k.e, n: k.n };
})();
const C = 2, E0 = -300, E1 = 260, N0 = -420, N1 = -10;
const NX = Math.round((E1 - E0) / C) + 1, NZ = Math.round((N1 - N0) / C) + 1;
const gh = new Float32Array(NX * NZ);
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) gh[j * NX + i] = bake(E0 + i * C, N0 + j * C);
const open = new Uint8Array(NX * NZ);
for (let j = 1; j < NZ - 1; j++) for (let i = 1; i < NX - 1; i++) {
  const o = j * NX + i, h = gh[o];
  const gx = (gh[o + 1] - gh[o - 1]) / (2 * C), gz = (gh[o + NX] - gh[o - NX]) / (2 * C);
  open[o] = h > 0.3 && Math.hypot(gx, gz) <= 1.0 ? 1 : 0;     // nav.js: a cell steeper than 45 deg is shut; no wading
}
function walk(a, b) {
  const idx = (e, n) => Math.round((n - N0) / C) * NX + Math.round((e - E0) / C);
  const s = idx(a.e, a.n), t = idx(b.e, b.n);
  const g = new Float64Array(NX * NZ).fill(Infinity), prev = new Int32Array(NX * NZ).fill(-1), done = new Uint8Array(NX * NZ);
  const heap = [];
  const push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const hx = (k) => Math.hypot((k % NX - t % NX) * C, (((k / NX) | 0) - ((t / NX) | 0)) * C);
  g[s] = 0; push(s, hx(s));
  const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (heap.length) {
    const [, k] = pop();
    if (done[k]) continue; done[k] = 1;
    if (k === t) break;
    const i = k % NX, j = (k / NX) | 0;
    for (const [di, dj] of D) {
      const ni = i + di, nj = j + dj; if (ni < 1 || nj < 1 || ni >= NX - 1 || nj >= NZ - 1) continue;
      const q = nj * NX + ni; if (!open[q] || done[q]) continue;
      const run = Math.hypot(di, dj) * C, rise = gh[q] - gh[k];
      const cost = Math.hypot(run, rise);
      if (g[k] + cost < g[q]) { g[q] = g[k] + cost; prev[q] = k; push(q, g[q] + hx(q)); }
    }
  }
  if (!Number.isFinite(g[t])) return null;
  let climbUp = 0;
  for (let k = t; prev[k] >= 0; k = prev[k]) climbUp += Math.max(0, gh[k] - gh[prev[k]]);
  return { len: g[t], climb: climbUp };
}
const JOG = 5.0;   // src/entities/player.js: the default W jog, m/s
const cist = { e: REST.x, n: -REST.z };
const legs = [
  ['Saltrow (the cistern) -> Ninewalls', cist, { e: nw.e, n: nw.n }],
  ['Ninewalls -> B1', { e: nw.e, n: nw.n }, { e: pad.x, n: -pad.z }],
  ['Ninewalls -> the terrace', { e: nw.e, n: nw.n }, { e: T.e, n: T.n }],
  [`Ninewalls -> the Malpais edge (E ${malpEdge.e}, N ${malpEdge.n})`, { e: nw.e, n: nw.n }, malpEdge],
];
rec.rows.walks = [];
for (const [name, a, b] of legs) {
  const w = walk(a, b);
  if (!w) { say(`  walk ${name}: NO PATH on the 2 m grid (a hole): FAIL`); rec.rows.walks.push({ name, ok: false }); continue; }
  say(`  walk ${name}: ${r1(w.len)} m (straight ${r1(Math.hypot(b.e - a.e, b.n - a.n))}), ${r1(w.climb)} m of climb; ${r1(w.len / JOG)} s at a ${JOG} m/s jog`);
  rec.rows.walks.push({ name, ok: true, len: r1(w.len), climb: r1(w.climb), jogS: r1(w.len / JOG) });
}
say(`  (the bible allows 0:21 to 0:28, 7 minutes, for the walk to the herd's beat; terrain only, Saltrow's buildings and props not in the grid)`);

/* 7. the Holds' height band (bible §3.3: 20-90 m) */
{
  const hs = [], w = new Float64Array(6);
  for (let n = -420; n <= -40; n += 4) for (let e = -200; e <= 320; e += 4) {
    biomesAt(e, -n, w);
    let bi = 0; for (let b = 1; b < 6; b++) if (w[b] > w[bi]) bi = b;
    if (BIOMES[bi] === 'holds') { const h = H(e, n); if (h > 0) hs.push(h); }
  }
  hs.sort((a, b) => a - b);
  const q = (p) => r1(hs[Math.floor(p * (hs.length - 1))]);
  const inBand = hs.filter((h) => h >= 20 && h <= 90).length / hs.length;
  say(`  the Holds (holds-dominant land, ${hs.length * 16} m2): heights p5 ${q(0.05)}, p50 ${q(0.5)}, p95 ${q(0.95)}; ${r1(inBand * 100)} % inside the bible's 20-90 m`);
  rec.rows.holdsBand = { p5: q(0.05), p50: q(0.5), p95: q(0.95), inBandPct: r1(inBand * 100) };
}

/* ======================================================================== HG1 */
say('HG1  the Scar (bars: 25 m +-1 wide at 10 stations; centreline within 0.5 m of a straight line over 480 m; a berm on both sides 0.6-1.5* m; B1 within 1 m of the centreline)');
function section(u, hf) {
  /* The floor: a line fitted to the middle 16 m. Each berm: the first ridge of the ground over that line walking out
   * from 8 m (its crest). The floor's edge on each side: where the ground first stands half that crest above the
   * line, walking out (the berm's inner half-height: the Scar's width is measured between them, as a ridge's width is,
   * because the bake's 1.94 m nodes smear a toe but not a mid-slope). A berm's height: its crest over the floor's
   * plane (the height it stands above the Scar). */
  let sv = 0, sh = 0, svv = 0, svh = 0, m = 0;
  const at = (v) => { const p = scarPoint(u, v); return hf(p.e, p.n); };
  for (let v = -8; v <= 8; v += 0.5) { const h = at(v); sv += v; sh += h; svv += v * v; svh += v * h; m++; }
  const s = (m * svh - sv * sh) / (m * svv - sv * sv), c = (sh - s * sv) / m;
  const res = (v) => at(v) - (c + s * v);
  const side = (dir) => {
    // the crest: the first ridge walking out from 8 m (the ground beyond a berm may rise higher: a valley's far side)
    let crest = -Infinity, vc = null;
    for (let v = 8; v <= 22; v += 0.05) {
      const r = res(dir * v);
      if (r > crest) { crest = r; vc = v; } else if (crest > 0.2 && r < crest - 0.05) break;
    }
    if (!(crest > 0.2)) return { edge: null, height: null };
    let edge = null;
    for (let v = 8; v <= vc; v += 0.05) if (res(dir * v) >= crest / 2) { edge = v; break; }
    // its height: the crest over the floor's plane carried out under it (what the berm stands above the Scar), and,
    // reported beside it, the crest over the ground 4 m beyond it (its back)
    const back = crest - res(dir * (vc + 4));
    return { edge: dir * edge, height: crest, back };
  };
  const Ls = side(-1), Rs = side(1);
  const L = Ls.edge, R = Rs.edge;
  return { L, R, width: L != null && R != null ? R - L : null, centre: L != null && R != null ? (L + R) / 2 : null, bermL: Ls.height, bermR: Rs.height, backL: Ls.back, backR: Rs.back };
}
function scarRows(label, hf) {
  const st = [];
  for (let i = 0; i < 10; i++) {
    const u = SCAR_LINE.len * (i + 0.5) / 10;
    st.push({ u: r1(u), ...section(u, hf) });
  }
  // the centreline's straightness: the stations' centres against their own best straight line (in the Scar frame)
  const cs = st.filter((s) => s.centre != null);
  let su = 0, sc = 0, suu = 0, suc = 0;
  for (const s of cs) { su += s.u; sc += s.centre; suu += s.u * s.u; suc += s.u * s.centre; }
  const k = (cs.length * suc - su * sc) / (cs.length * suu - su * su), c0 = (sc - k * su) / cs.length;
  const dev = Math.max(...cs.map((s) => Math.abs(s.centre - (c0 + k * s.u))));
  const wOk = st.every((s) => s.width != null && Math.abs(s.width - 25) <= 1);
  const bOk = st.every((s) => s.bermL != null && s.bermR != null && s.bermL >= 0.6 && s.bermL <= 1.5 && s.bermR >= 0.6 && s.bermR <= 1.5);
  const widths = st.map((s) => (s.width == null ? 'none' : r2(s.width)));
  const berms = st.map((s) => `${s.bermL == null ? '-' : r2(s.bermL)}/${s.bermR == null ? '-' : r2(s.bermR)}`);
  say(`  [${label}] width at 10 stations (m): ${widths.join(' ')}: ${verdict(wOk)}`);
  say(`  [${label}] centreline: stations' centres off the line ${cs.map((s) => r2(s.centre)).join(' ')}; worst deviation from a straight line ${r2(dev)} m over ${r1(cs[cs.length - 1].u - cs[0].u)} m of stations (${r1(SCAR_LINE.len)} m line): ${verdict(dev <= 0.5)}`);
  say(`  [${label}] berms left/right (m): ${berms.join(' ')}: ${verdict(bOk)}`);
  return { stations: st.map((s) => ({ u: s.u, width: s.width == null ? null : r2(s.width), centre: s.centre == null ? null : r2(s.centre), bermL: s.bermL == null ? null : r2(s.bermL), bermR: s.bermR == null ? null : r2(s.bermR) })), straightDev: r2(dev), widthOk: wOk, bermOk: bOk };
}
rec.rows.hg1 = { recipe: scarRows('recipe', H), bake: scarRows('bake', bake), b1OffLine: r2(Math.abs(fB1.v)), b1Ok: Math.abs(fB1.v) <= 1 };
say(`  B1 ${r2(Math.abs(fB1.v))} m off the centreline: ${verdict(Math.abs(fB1.v) <= 1)}`);

/* ======================================================================== the change against a base tree */
const BASE = flag('--base');
if (BASE) {
  const base = await import(pathToFileURL(path.resolve(BASE, 'src/world/island/recipe.js')).href);
  base.ensureMacro();
  let moved = 0, outside = 0, maxD = 0, nodes = 0;
  let bb = [Infinity, -Infinity, Infinity, -Infinity];
  for (let iz = 0; iz < side; iz++) for (let ix = 0; ix < side; ix++) {
    const x = ix * step - half, z = iz * step - half;
    const a = base.heightAt(x, z), b = node(ix, iz); nodes++;
    if (a !== b) {
      moved++; maxD = Math.max(maxD, Math.abs(a - b));
      const e = x, n = -z;
      bb = [Math.min(bb[0], e), Math.max(bb[1], e), Math.min(bb[2], n), Math.max(bb[3], n)];
      if (e < FOOTPRINT.e0 || e > FOOTPRINT.e1 || n < FOOTPRINT.n0 || n > FOOTPRINT.n1) outside++;
    }
  }
  say(`CHANGE against ${BASE}: ${moved} of ${nodes} bake nodes moved (largest ${r2(maxD)} m), inside E ${r1(bb[0])}..${r1(bb[1])}, N ${r1(bb[2])}..${r1(bb[3])}; ${outside} outside the blockout's footprint: ${verdict(outside === 0)}`);
  rec.change = { base: BASE, moved, nodes, maxD: r2(maxD), box: bb.map(r1), outside };
}

rec.footprint = FOOTPRINT;
rec.barranco = BARRANCO;
if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify(rec, null, 1));
