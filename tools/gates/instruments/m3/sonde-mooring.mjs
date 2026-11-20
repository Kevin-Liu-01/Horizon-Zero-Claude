/**
 * M3 wave 1, area C: THE SONDE'S MOORING against the accepted lenses and the bow (row 0 of IK0; M3 briefs §2 rule 19:
 * "a moving thing (the Sonde ...) is either kept out of every accepted lens by placement or masked by its swept
 * volume"; §6 row 0: "can an arrow reach it from the rise; is the post in an accepted lens").
 *
 *   node tools/gates/instruments/m3/sonde-mooring.mjs [--runs <review runs dir>]
 *
 * THE POST is SONDE_MOORING (src/instruments/kinds/sonde/form.js): on the Sounding Ring's rise, downwind (SW) of the
 * Ring's foot, so the trade leans the Sonde away from the Ring and a cut tether drifts it clear of it.
 *
 * THE LENSES. Every frame lens probed in a film run (run.json frames[].probe: position, quaternion, fov, aspect, read
 * off the frozen frame by tools/frames/film.mjs --probe, the same records tools/world/skyline-masks.mjs reads; the
 * newest probe of each frame id). The swept volume is everything the Sonde can fill: the sphere of the tether plus the
 * hull's reach (sweptVolume(): 18 m + the hull's reach from the form's parts + 0.5 m, the same ball ./sonde-mask.mjs
 * masks: rule 21) round the shackle, above the ground, and the post. A lens SEES it when any of ~650 points on
 * that volume's surface projects inside the 1600 x 900 frame with no ground (the island bake, bilinear, as the masks
 * march it) between it and the lens. Nothing but the ground occludes (the Ring, houses: the answer is only ever too
 * large). Frames of the frameset with no probe on file are listed UNMEASURED by name.
 *
 * THE BOW. `ArrowPool.predict` (src/combat/arrows.js: the game's own flight, read ahead) over the island ground, from
 * her bow (1.45 m over the ground) at points on the rise round the post, at the tether's points 4, 9 and 14 m along it
 * and the keel ring, the pitch solved by bisection on the flight's closest approach. Reached: the flight passes within
 * 0.05 m of the aim before it meets the ground.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { ensureMacro, heightAt } from '../../../../src/world/island/recipe.js';
import { GRID } from '../../../../src/world/island/bake.js';
import { siteById } from '../../../../src/world/island/sites.js';
import { SONDE_MOORING, SONDE_POST, SONDE_KEEL } from '../../../../src/instruments/kinds/sonde/form.js';
import { M3_FORMS, expandParts } from './forms.mjs';
import { SondeBrain, SONDE_RULES } from '../../../../src/instruments/kinds/sonde/rules.js';
import { REVIEW } from '../../../frames/paths.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const r2 = (v) => +v.toFixed(2);
const D2R = Math.PI / 180;

let _ground = null;
/** The island bake, bilinear on the render grid (skyline-masks.mjs's ground). */
export function ground() {
  if (_ground) return _ground;
  ensureMacro();
  const { side, step, half } = GRID, H = new Float32Array(side * side);
  for (let iz = 0; iz < side; iz++) for (let ix = 0; ix < side; ix++) H[iz * side + ix] = heightAt(ix * step - half, iz * step - half);
  _ground = (x, z) => {
    const fx = (x + half) / step, fz = (z + half) / step;
    if (fx < 0 || fz < 0 || fx >= side - 1 || fz >= side - 1) return -20;
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, o = iz * side + ix;
    const a = H[o], b = H[o + 1], c = H[o + side], d = H[o + side + 1];
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz;
  };
  return _ground;
}

/** The post's foot (engine x, z, ground y) and the shackle, from SONDE_MOORING. */
export function mooringPost() {
  const ring = siteById(SONDE_MOORING.site), b = SONDE_MOORING.bearingDeg * D2R;
  const x = ring.x + Math.sin(b) * SONDE_MOORING.offsetM, z = ring.z - Math.cos(b) * SONDE_MOORING.offsetM;
  const y = ground()(x, z);
  return { ring: { x: ring.x, z: ring.z, y: r2(ground()(ring.x, ring.z)) }, x: r2(x), z: r2(z), y: r2(y), shackleY: r2(y + SONDE_POST.h) };
}

/** The farthest any point of the hull lies from its keel ring (m), from every part's bounding corners. */
export function hullReach() {
  let best = 0;
  const K = SONDE_KEEL, AX = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  const at = (x, y, z) => { best = Math.max(best, Math.hypot(x - K[0], y - K[1], z - K[2])); };
  for (const p of expandParts(M3_FORMS.sonde.parts)) {
    if (p.type === 'box') { for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) at(p.c[0] + sx * p.s[0] / 2, p.c[1] + sy * p.s[1] / 2, p.c[2] + sz * p.s[2] / 2); }
    else if (p.type === 'cyl') {
      const a = AX[p.axis || 'y'], r = Math.max(p.r, p.r2 ?? p.r), e = [0, 1, 2].map((k) => (a[k] ? p.h / 2 : r));
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) at(p.c[0] + sx * e[0], p.c[1] + sy * e[1], p.c[2] + sz * e[2]);
    } else if (p.type === 'strut') { for (const q of [p.a, p.b]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) at(q[0] + sx * p.r, q[1] + sy * p.r, q[2] + sz * p.r); }
  }
  return best;
}

/** The swept volume: { c: [x, y, z] the shackle (engine frame), R }. */
export function sweptVolume() {
  const P = mooringPost(), reach = hullReach();
  return { c: [P.x, P.shackleY, P.z], R: SONDE_RULES.tetherM + reach + 0.5, reach: Math.round(reach * 1000) / 1000, tetherM: SONDE_RULES.tetherM, post: P };
}

/** The newest probe of each frame id across the film runs (and the frameset's ids, to name the ones without one). */
export function probedLenses(runsDir = path.join(REVIEW, 'runs')) {
  const best = new Map();
  const dirs = existsSync(runsDir) ? readdirSync(runsDir).sort() : [];
  for (const d of dirs) {
    const f = path.join(runsDir, d, 'run.json');
    if (!existsSync(f)) continue;
    let run; try { run = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
    for (const fr of run.frames || []) if (fr.probe?.quaternion && fr.probe?.position && fr.ok !== false && (fr.repeat || 1) === 1) best.set(fr.id, { ...fr.probe, run: d, commit: run.commit });
  }
  let frameset = [];
  try { frameset = JSON.parse(readFileSync(path.join(REPO, 'tools/frames/frameset.json'), 'utf8')).frames.map((f) => ({ id: f.id, camera: f.camera })); } catch { /* none */ }
  return { lenses: best, frameset };
}

/** Points on the swept volume's surface (upper half-sphere of radius R round the shackle, its rim on the ground) and the post. */
function sweptPoints(P, R) {
  const g = ground(), pts = [];
  for (let i = 0; i <= 12; i++) {
    const el = (i / 12) * (Math.PI / 2);
    const n = Math.max(1, Math.round(48 * Math.cos(el)));
    for (let j = 0; j < n; j++) {
      const az = (j / n) * Math.PI * 2;
      const x = P.x + Math.cos(el) * Math.sin(az) * R, z = P.z + Math.cos(el) * Math.cos(az) * R;
      const y = Math.max(P.shackleY + Math.sin(el) * R, g(x, z) + 0.2);
      pts.push([x, y, z]);
    }
  }
  for (let h = 0.2; h <= SONDE_POST.h; h += 0.55) pts.push([P.x, P.y + h, P.z]);
  return pts;
}

/** Does the lens see any of the points (inside the frame, no ground between)? Returns the visible count and frame box. */
function lensSees(probe, pts, W = 1600, Hh = 900) {
  const g = ground();
  const q = new THREE.Quaternion(...probe.quaternion).invert(), o = new THREE.Vector3(...probe.position);
  const t = Math.tan((probe.fov * D2R) / 2), asp = probe.aspect || W / Hh;
  const v = new THREE.Vector3();
  let seen = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, nearest = Infinity;
  for (const p of pts) {
    v.set(p[0], p[1], p[2]).sub(o).applyQuaternion(q);
    if (v.z >= -0.1) continue;
    const nx = v.x / (-v.z) / (t * asp), ny = v.y / (-v.z) / t;
    if (Math.abs(nx) > 1 || Math.abs(ny) > 1) continue;
    // the ground between the lens and the point (the masks' march)
    const dx = p[0] - o.x, dy = p[1] - o.y, dz = p[2] - o.z, L = Math.hypot(dx, dy, dz);
    let blocked = false;
    for (let s = 0.3; s < L - 0.5; s += Math.max(0.25, s * 0.004)) {
      const x = o.x + dx * s / L, y = o.y + dy * s / L, z = o.z + dz * s / L;
      const gg = g(x, z);
      if (y <= (gg > 0 ? gg : 0)) { blocked = true; break; }
    }
    if (blocked) continue;
    seen++;
    const px = (nx + 1) / 2 * W, py = (1 - ny) / 2 * Hh;
    minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    nearest = Math.min(nearest, L);
  }
  return seen ? { seen, of: pts.length, box: [Math.round(minX), Math.round(minY), Math.round(maxX), Math.round(maxY)], nearestM: r2(nearest) } : { seen: 0, of: pts.length };
}

export function lensCheck(runsDir) {
  const V = sweptVolume(), P = V.post, R = V.R;
  const pts = sweptPoints({ ...P, shackleY: V.c[1] }, R);
  const { lenses, frameset } = probedLenses(runsDir);
  const accepted = new Set(frameset.map((f) => f.id));
  const rows = [];
  for (const [id, pr] of [...lenses.entries()].sort()) {
    const s = lensSees(pr, pts);
    rows.push({ id, accepted: accepted.has(id), distM: r2(Math.hypot(pr.position[0] - P.x, pr.position[2] - P.z)), ...s, run: pr.run });
  }
  const seenBy = rows.filter((r) => r.seen > 0);
  const noProbe = frameset.filter((f) => !lenses.has(f.id)).map((f) => `${f.id} (${f.camera?.mode}${f.camera?.screen ? ` ${f.camera.screen}` : ''})`);
  return {
    post: P, sweptR: Math.round(R * 1000) / 1000, hullReachM: V.reach, points: pts.length, lensesChecked: rows.length,
    seenBy: seenBy.map((r) => ({ id: r.id, accepted: r.accepted, distM: r.distM, visiblePts: `${r.seen}/${r.of}`, frameBox: r.box, nearestM: r.nearestM })),
    acceptedSeeing: seenBy.filter((r) => r.accepted).map((r) => r.id),
    clearOf: rows.filter((r) => !r.seen).map((r) => r.id),
    unmeasuredNoProbe: noProbe,
  };
}

/* ---------------------------------------------------------------- the bow: ArrowPool.predict over the island */
export async function arrowCheck() {
  // arrows.js draws two sprite textures on a canvas at import: a stand-in canvas (tools/gates/systems/arrow-predict.test.mjs)
  globalThis.document ??= { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }) };
  const { ArrowPool } = await import('../../../../src/combat/arrows.js');
  const speed = 62;   // the hunter bow's arrow (src/combat/weapons.js: speed 62)
  const g = ground();
  const terrain = { getHeight: (x, z) => g(x, z), getNormal: (x, z, o) => o.set(0, 1, 0) };
  const pool = new ArrowPool({ scene: new THREE.Scene(), terrain, machines: { list: [] }, events: { emit() {} } }, null, 4);
  const P = mooringPost();
  // the Sonde moored in the trade at the post (its own rules)
  const S = new SondeBrain({ post: { x: P.x, y: P.y, z: P.z } });
  for (let t = 0; t < 60; t += 1 / 60) S.step(1 / 60, { wind: { speed: 5, fromDeg: 45 }, groundY: () => P.y });
  const sh = S.shackle(), kl = S.keel(), run = S.tetherDist();
  const along = (m) => { const k = m / run; return new THREE.Vector3(sh.x + (kl.x - sh.x) * k, sh.y + (kl.y - sh.y) * k, sh.z + (kl.z - sh.z) * k); };
  const aims = [['tether 4 m', along(4)], ['tether 9 m', along(9)], ['tether 14 m', along(14)], ['keel ring', new THREE.Vector3(kl.x, kl.y, kl.z)]];
  const out = [];
  for (const dist of [15, 20, 30]) {
    for (const brg of [0, 90, 135, 180, 270]) {
      const b = brg * D2R, x = P.x + Math.sin(b) * dist, z = P.z - Math.cos(b) * dist;
      const o = new THREE.Vector3(x, g(x, z) + 1.45, z);
      for (const [name, aim] of aims) {
        const yaw = Math.atan2(aim.x - o.x, aim.z - o.z);
        const dirAt = (pitch) => new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
        // bisection on the vertical miss at closest approach: low pitches pass under, high ones over
        let lo = -0.2, hi = 1.4, best = null;
        for (let i = 0; i < 40; i++) {
          const mid = (lo + hi) / 2, r = pool.predict(o, dirAt(mid), speed, { aim, maxT: 3 });
          if (!best || r.d < best.d) best = { ...r, pitch: mid };
          if (r.dy < 0) lo = mid; else hi = mid;
        }
        const groundFirst = best.hit === 'ground' && best.t != null && best.tAim != null && best.t < best.tAim;
        out.push({ from: `${dist} m at ${brg}`, aim: name, aimUpM: r2(aim.y - g(aim.x, aim.z)), missM: +best.d.toFixed(3), pitchDeg: r2(best.pitch / D2R), groundFirst, reached: best.d <= 0.05 && !groundFirst });
      }
    }
  }
  const reached = out.filter((r) => r.reached).length;
  return { speed, tetherRunM: r2(run), shots: out.length, reached: `${reached}/${out.length}`, notReached: out.filter((r) => !r.reached),
    worstMissM: Math.max(...out.map((r) => r.missM)), note: 'the Ring itself is not an occluder here (no hulls installed): a shot through the Ring is counted as reaching' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--runs');
  const res = { lens: lensCheck(i > 0 ? process.argv[i + 1] : undefined), bow: await arrowCheck() };
  console.log(JSON.stringify(res, null, 1));
}
