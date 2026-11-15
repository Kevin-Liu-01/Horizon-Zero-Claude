// M1.5a / M1.5e Saltrow: colliders on the walls, the nav grid open in the street and shut in the houses, the people
// at work clear of walls and cones, the breakwater lamp ahead of F07's lens, the sighting kite's line clear of the
// ground and the kite against the sky from the cistern. Browser-free: node --test tools/build/settlements/saltrow.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Collision } from '../../../src/core/collision.js';
import { Nav } from '../../../src/core/nav.js';
import {
  BUILDINGS, CONES, CREW, KITE, HARBOUR, BREAKWATER_LAMP, BREAKWATER_LENS, BREAKWATER_LAMP_AT, STREET,
  placeOf, streetPoint, rooflineCheck, restClearance, townColliders,
} from '../../../src/world/settlements/saltrow-layout.js';
import { heightAt } from '../../../src/world/island/recipe.js';
import { REST } from '../../../src/world/island/sites.js';

const D2R = Math.PI / 180;
const FLAT = 1.0;

/** The town's colliders as saltrow.js registers them, on flat ground at FLAT, into a real Collision and Nav. */
function townWorld() {
  const ctx = { terrain: { getHeight: () => FLAT, seaLevel: -10 } };
  const collision = new Collision(ctx, { machineColliders: false });
  ctx.collision = collision;
  const nav = new Nav(ctx, collision);
  ctx.nav = nav;
  const town = {};
  town.buildings = BUILDINGS.map((b) => { const p = placeOf(b); return { id: b.id, x: p.x, y: FLAT, z: p.z, yaw: p.yaw, w: b.w, d: b.d, h: b.h, step: b.step }; });
  const bw = HARBOUR.breakwater, yaw = Math.PI - bw.bearing * D2R;
  town.breakwater = { x: bw.x, y: FLAT, z: bw.z, yaw, length: bw.length, width: bw.width };
  town.colliderCount = 0;
  for (const d of townColliders({ buildings: town.buildings, breakwater: town.breakwater, ground: () => FLAT })) if (collision.register(d) != null) town.colliderCount++;
  nav.buildNow();
  return { ctx, collision, nav, town };
}

/** A building-local point (three's rotation.y = yaw: local +z is the front) to the world. */
function toWorld(b, lx, lz) {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  return { x: b.x + c * lx + s * lz, z: b.z - s * lx + c * lz };
}

function insideFootprint(b, x, z, margin = 0) {
  const dx = x - b.x, dz = z - b.z, c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) < b.w / 2 + margin && Math.abs(lz) < b.d / 2 + margin;
}

const W = townWorld();

test('the layout: no two neighbours share a roofline; REST stands clear of every wall', () => {
  assert.deepEqual(rooflineCheck(), []);
  assert.ok(restClearance() > 3, `REST clearance ${restClearance()}`);
  assert.ok(BUILDINGS.length >= 24);
});

test('a collider on every building, on its own walls (inside pushes out, 0.6 m outside the front is free)', () => {
  const C = W.collision;
  assert.ok(W.town.colliderCount >= BUILDINGS.length + CONES.length + 1, `colliders ${W.town.colliderCount}`);
  let checked = 0;
  for (const b of W.town.buildings) {
    for (const [lx, lz] of [[b.w / 2 - 0.3, 0], [-b.w / 2 + 0.3, 0], [0, b.d / 2 - 0.3], [0, -b.d / 2 + 0.3], [b.w / 2 - 0.3, b.d / 2 - 0.3]]) {
      const p = toWorld(b, lx, lz);
      const pos = { x: p.x, y: FLAT, z: p.z };
      const r = C.resolveCapsule(pos, 0.4, 1.7, { passes: 1 });
      assert.ok(r?.hit, `${b.id}: no collider at local (${lx.toFixed(1)}, ${lz.toFixed(1)})`);
      checked++;
    }
    const f = toWorld(b, 0, b.d / 2 + 0.6);
    if (W.town.buildings.some((q) => q !== b && insideFootprint(q, f.x, f.z, 0.4))) continue;   // r5's front faces the guild house's side 0.5 m off
    const free = C.resolveCapsule({ x: f.x, y: FLAT, z: f.z }, 0.4, 1.7, { passes: 1, filter: (c) => c.kind === 'landmark' });
    assert.ok(!free?.hit, `${b.id}: its collider stands out over the street in front of its door`);
  }
  assert.equal(checked, BUILDINGS.length * 5);
});

test('the nav grid: the street open from the foot to the guild step, every house shut, a path up the street', () => {
  const N = W.nav;
  assert.ok(N.ready);
  const open = [];
  for (let s = 2; s <= 44; s += 2) { const p = streetPoint(s, 0); open.push(!N.blockedAt(p.x, p.z)); }
  assert.ok(open.every(Boolean), `street cells blocked at s = ${open.map((o, i) => (o ? null : 2 + i * 2)).filter((v) => v != null)}`);
  for (const b of W.town.buildings) assert.ok(N.blockedAt(b.x, b.z), `${b.id}: its centre is open on the grid`);
  const a = streetPoint(1, 0), g = streetPoint(42, 0);
  const path = N.path({ x: a.x, y: FLAT, z: a.z }, { x: g.x, y: FLAT, z: g.z });
  assert.ok(path && path.length >= 2, 'no path up the street');
  for (let i = 0; i + 1 < path.length; i++) {
    for (let k = 0; k <= 10; k++) {
      const x = path[i].x + (path[i + 1].x - path[i].x) * k / 10, z = path[i].z + (path[i + 1].z - path[i].z) * k / 10;
      const hit = W.town.buildings.find((b) => insideFootprint(b, x, z));
      assert.ok(!hit, `the path crosses ${hit?.id} at (${x.toFixed(1)}, ${z.toFixed(1)})`);
    }
  }
});

test('the people at work: five, apart, out of every wall and cone, each facing its work', () => {
  assert.equal(CREW.length, 5);
  const pts = CREW.map((c) => ({ c, ...streetPoint(c.s, c.r) }));
  for (const p of pts) {
    const b = W.town.buildings.find((q) => insideFootprint(q, p.x, p.z, 0.3));
    assert.ok(!b, `${p.c.id} stands in ${b?.id}`);
    for (const k of CONES) assert.ok(Math.hypot(p.x - k.x, p.z - k.z) > k.r + 0.25, `${p.c.id} stands in a cone`);
    assert.ok(Math.hypot(p.x - REST.x, p.z - REST.z) > 4, `${p.c.id} stands on REST`);
    const f = streetPoint(p.c.face.s, p.c.face.r);
    assert.ok(Math.hypot(f.x - p.x, f.z - p.z) > 0.5, `${p.c.id} has no direction to face`);
  }
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z) > 1.5);
  // all inside F22's lens (bible E -290, N -252, bearing 40, 55 deg vertical at 16:9: +-42.8 deg across)
  for (const p of pts) {
    const b = Math.atan2(p.x - -290, -(p.z - 252)) / D2R;
    assert.ok(Math.abs(b - 40) < 40, `${p.c.id} on bearing ${b.toFixed(1)} from F22`);
  }
});

test('the breakwater lamp stands on the deck, ahead of F07\'s lens on the breakwater', () => {
  const bw = HARBOUR.breakwater;
  assert.ok(BREAKWATER_LAMP_AT.along > 0 && BREAKWATER_LAMP_AT.along < bw.length && Math.abs(BREAKWATER_LAMP_AT.side) < bw.width / 2 - 0.4);
  const L = BREAKWATER_LENS;
  const b = Math.atan2(BREAKWATER_LAMP.x - L.x, -(BREAKWATER_LAMP.z - L.z)) / D2R;
  assert.ok(Math.abs(b - L.bearing) < 30, `the lamp on ${b.toFixed(1)} from the lens looking ${L.bearing}`);
  const t = streetPoint(28, 0), bt = Math.atan2(t.x - L.x, -(t.z - L.z)) / D2R;
  assert.ok(Math.abs(bt - L.bearing) < 30, `the town on ${bt.toFixed(1)}`);
});

test('the sighting kite: its line clear of the ground, against the sky from the cistern, over the town', () => {
  const ay = heightAt(KITE.anchor.x, KITE.anchor.z) + 0.6;
  let clear = Infinity;
  const len = Math.hypot(KITE.x - KITE.anchor.x, KITE.y - ay, KITE.z - KITE.anchor.z);
  for (let u = 0.02; u <= 1; u += 0.02) {
    const x = KITE.anchor.x + (KITE.x - KITE.anchor.x) * u, z = KITE.anchor.z + (KITE.z - KITE.anchor.z) * u;
    const y = ay + (KITE.y - ay) * u - 0.035 * len * 4 * u * (1 - u);
    clear = Math.min(clear, y - heightAt(x, z));
  }
  assert.ok(clear > 0.3, `the line touches the ground (${clear.toFixed(2)} m)`);
  const eye = heightAt(REST.x, REST.z) + 1.7;
  const d = Math.hypot(KITE.x - REST.x, KITE.z - REST.z), el = Math.atan2(KITE.y - eye, d) / D2R;
  const bear = Math.atan2(KITE.x - REST.x, -(KITE.z - REST.z)) / D2R;
  let sky = -90;
  for (let r = 20; r < 1500; r += 5) sky = Math.max(sky, Math.atan2(heightAt(REST.x + Math.sin(bear * D2R) * r, REST.z - Math.cos(bear * D2R) * r) - eye, r) / D2R);
  assert.ok(el > sky + 3, `the kite at ${el.toFixed(1)} deg, the skyline behind it at ${sky.toFixed(1)}`);
  // and over the roofs between: every block (and raised roof block, and the guild's gable) on the sight line from her eye
  let roof = -90;
  for (let r = 1; r < d; r += 0.25) {
    const x = REST.x + Math.sin(bear * D2R) * r, z = REST.z - Math.cos(bear * D2R) * r;
    for (const b of BUILDINGS) {
      const p = placeOf(b), c = Math.cos(p.yaw), s = Math.sin(p.yaw), dx = x - p.x, dz = z - p.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) > b.w / 2 || Math.abs(lz) > b.d / 2) continue;
      const fy = heightAt(p.x + s * (b.d / 2 + 0.4), p.z + c * (b.d / 2 + 0.4)) + 0.04;
      let top = fy + b.h + (b.kind === 'guild' ? 2.2 : 0);
      if (b.step && Math.abs(lx - b.step.x) <= b.step.w / 2 && Math.abs(lz - b.step.z) <= b.step.d / 2) top = fy + b.h - 0.5 + b.step.h;
      roof = Math.max(roof, Math.atan2(top - (eye - 0.1), r) / D2R);
    }
  }
  assert.ok(el > roof + 3, `the kite at ${el.toFixed(1)} deg behind roofs at ${roof.toFixed(1)} deg from the cistern`);
  assert.ok(el < 26, `the kite ${el.toFixed(1)} deg up from the cistern: over a chase lens's top edge`);
  assert.ok(KITE.y - heightAt(KITE.x, KITE.z) > 12, 'the kite flies under 12 m');
  // over the town: within 30 m of its nearest building
  const near = Math.min(...BUILDINGS.map((b) => { const p = placeOf(b); return Math.hypot(p.x - KITE.x, p.z - KITE.z); }));
  assert.ok(near < 30, `the kite ${near.toFixed(1)} m from the nearest house`);
  assert.ok(KITE.hours[0] <= 7 && KITE.hours[1] >= 7, 'down at 07:00');
  assert.ok(STREET.length > 0);
});
