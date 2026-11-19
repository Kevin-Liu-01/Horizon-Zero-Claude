// M2 wave 1 (area B) Ninewalls at blockout: the nine walls' data, their state and save pair, the Screed's segment
// test, the colliders in a real collision world, the occluders in the sight seam, and NW0 on a level pad.
// Browser-free: node --test tools/build/settlements/ninewalls.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Collision } from '../../../src/core/collision.js';
import * as THREE from 'three';
import { setOccluder, clearOccluders, sightBlocked } from '../../../src/instruments/lib/sight.js';
import {
  WALLS, OUTER_R, CENTRE, DWELLINGS, PLACES, polar, wallById, wallState, setWallCut, setPainted, resetWalls, wallsSave,
  onWallChange, segmentHitsWall, wallOccluders, ninewallsColliders, rooflineCheck, scarDistance, SCAR_CLEAR, topOf,
} from '../../../src/world/settlements/ninewalls-layout.js';

const FLAT = 71;
const flat = () => FLAT;

test('nine walls, outside in, concentric, their backs to the north-east, the line on three or more', () => {
  assert.equal(WALLS.length, 9);
  WALLS.forEach((w, i) => {
    assert.equal(w.id, `wall-${i + 1}`); assert.equal(w.order, i + 1);
    assert.ok(w.from < 45 && w.to > 45, `${w.id} spans its back at bearing 45`);
    if (i) assert.ok(w.r < WALLS[i - 1].r, 'radii fall inward');
    assert.ok(w.lineH + w.lineW / 2 < w.h, 'the line is below the top');
  });
  assert.ok(WALLS.filter((w) => w.painted0).length >= 3);
  assert.equal(OUTER_R, WALLS[0].r + WALLS[0].t / 2);
  for (const w of WALLS) for (const b of [w.from, w.to, (w.from + w.to) / 2]) {
    const p = polar(b, w.r);
    assert.ok(scarDistance(p.x, p.z) >= SCAR_CLEAR, `${w.id} at ${b} stands off the Scar`);
  }
  assert.deepEqual(rooflineCheck(), []);
  assert.equal(DWELLINGS.length, 16);
});

test('state: cut and painted, listeners, the save pair round trip, a record without the field', () => {
  resetWalls();
  const seen = [];
  const off = onWallChange((id) => seen.push(id));
  setWallCut('wall-2'); setPainted('wall-1', false); setWallCut('wall-2');
  assert.deepEqual(seen, ['wall-2', 'wall-1'], 'a change tells once; a repeat does not');
  const S = wallsSave(), saved = S.get();
  assert.deepEqual(saved['wall-2'], { state: 'cut', painted: true });
  assert.deepEqual(saved['wall-1'], { state: 'whole', painted: false });
  resetWalls();
  assert.equal(wallState('wall-2').state, 'whole');
  S.set(JSON.parse(JSON.stringify(saved)));
  assert.equal(wallState('wall-2').state, 'cut');
  assert.equal(wallState('wall-1').painted, false);
  S.set(null);
  assert.equal(wallState('wall-2').state, 'whole');
  assert.equal(wallState('wall-1').painted, true);
  off();
  assert.equal(topOf(wallById('wall-3'), 'cut'), wallById('wall-3').lineH + wallById('wall-3').lineW / 2);
});

test("the Screed's charge: stopped by the first whole wall, through a cut one, clear along a chord", () => {
  resetWalls();
  const a = polar(45, OUTER_R + 30), b = polar(45, 20);
  let h = segmentHitsWall(a.x, a.z, b.x, b.z, 1.8);
  assert.equal(h.id, 'wall-1');
  const rFace = Math.hypot(h.x - CENTRE.x, h.z - CENTRE.z);
  assert.ok(Math.abs(rFace - (OUTER_R + 1.8)) < 0.02, `stops at the outer face plus its half-width (${rFace})`);
  setWallCut('wall-1');
  h = segmentHitsWall(a.x, a.z, b.x, b.z, 1.8);
  assert.equal(h.id, 'wall-2');
  assert.equal(segmentHitsWall(a.x, a.z, b.x, b.z, 1.8, { includeCut: true }).id, 'wall-1');
  resetWalls();
  // a 25 m chord between wall-1 and wall-2, its body's inner edge 0.5 m off wall-2's outer face
  const w2 = wallById('wall-2'), q = w2.r + w2.t / 2 + 0.5 + 1.8;
  const mid = polar(10, q), t = { x: Math.cos(10 * Math.PI / 180), z: Math.sin(10 * Math.PI / 180) };
  assert.equal(segmentHitsWall(mid.x - t.x * 12.5, mid.z - t.z * 12.5, mid.x + t.x * 12.5, mid.z + t.z * 12.5, 1.8), null);
  // round ends: a move past wall-1's north-west end, inside its cap, is stopped
  const w1 = wallById('wall-1'), e = polar(w1.from, w1.r);
  assert.ok(segmentHitsWall(e.x - 5, e.z, e.x + 5, e.z, 0.3));
});

test('the colliders stop a walker at each wall, on level ground', () => {
  resetWalls();
  const ctx = { terrain: { getHeight: flat, seaLevel: -10 } };
  const C = new Collision(ctx, { machineColliders: false });
  for (const d of ninewallsColliders(flat)) C.register(d);
  for (const w of WALLS) for (const b of [w.from + 3, 45, w.to - 3]) {
    const from = polar(b, w.r + 2), to = polar(b, w.r - 2);
    const hit = C.capsuleCast(new THREE.Vector3(from.x, FLAT + 0.05, from.z), new THREE.Vector3(to.x, FLAT + 0.05, to.z), 0.4, 1.7);
    assert.ok(hit && hit.hit, `${w.id} at bearing ${b} stops a capsule`);
  }
  // the open south-west: a walk in from B1's side to the cistern meets no wall
  const out = polar(225, OUTER_R + 10), cis = PLACES.cistern;
  const walk = C.capsuleCast(new THREE.Vector3(out.x, FLAT + 0.05, out.z), new THREE.Vector3(cis.x, FLAT + 0.05, cis.z + 3), 0.4, 1.7, { filter: (c) => c.kind === 'landmark' });
  assert.ok(!walk || !walk.hit, 'the south-west is open');
});

test('the occluders: a sightline through a wall is blocked, one over its top is not; all nine walls listed', () => {
  resetWalls();
  clearOccluders('ninewalls:');
  const occ = wallOccluders(flat);
  assert.equal(new Set(occ.map((o) => o.id)).size, 9);
  assert.equal(occ.length, 9, 'level ground: one piece a wall');
  for (const o of occ) setOccluder(o.slot, o.shape);
  const a = polar(45, OUTER_R + 20), b = polar(45, 10);
  assert.match(sightBlocked(a.x, FLAT + 1.2, a.z, b.x, FLAT + 1.2, b.z) || '', /^ninewalls:wall-1:/);
  assert.equal(sightBlocked(a.x, FLAT + 12, a.z, b.x, FLAT + 12, b.z), null);
  setPainted('wall-1', false); setWallCut('wall-1');
  for (const o of wallOccluders(flat)) setOccluder(o.slot, o.shape);
  // a cut wall stands to its line's top (1.275 m): a crouched eye at 1.0 is behind it, a standing one at 1.6 sees over
  const w1 = wallById('wall-1'), p0 = polar(45, w1.r + 3), p1 = polar(45, w1.r - 1.5);
  assert.match(sightBlocked(p0.x, FLAT + 1.0, p0.z, p1.x, FLAT + 1.0, p1.z) || '', /^ninewalls:wall-1:/);
  assert.equal(sightBlocked(p0.x, FLAT + 1.6, p0.z, p1.x, FLAT + 1.6, p1.z), null);
  clearOccluders('ninewalls:');
  resetWalls();
});

test('NW0 on a level pad at the stated height: the fight, the roofs and the count from the Rise all pass', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'nw0-'));
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    execFileSync(process.execPath, [path.join(here, 'ninewalls-rows.mjs'), '--flat', '--json', path.join(dir, 'nw0.json')], { encoding: 'utf8' });
    const r = JSON.parse(readFileSync(path.join(dir, 'nw0.json'), 'utf8'));
    assert.ok(r.nw0.a.pass, 'a Screed stands and charges 25 m between the outer three walls');
    assert.ok(r.nw0.b.both >= 12, `${r.nw0.b.both} roofs below wall-top`);
    assert.equal(r.nw0.c.countable, 9);
    assert.ok(r.nw3.pass);
    assert.ok(r.site.scar.pass && r.site.rise.outside && r.site.trigRays.every((t) => !t.wallHits));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
