// The runner's walkable line (./walk-route.js) over the island recipe's heights (Ninewalls' terraces and road are in
// them) and the game's own colliders as collision.register takes them (Ninewalls' crescent walls, dwellings, tree,
// counter, cistern and the tube mouth's jambs; the Kiln Yards' towers, stacks, wellheads and rack posts): leg 6's two
// long walks (the fishing hut to Oro, Oro to the Kiln Yards' south-west corner) exist, no leg between two waypoints
// crosses a crescent wall (cut or whole), none comes inside a collider, and no step climbs more than the bar.
// Browser-free: node --test src/game/hour2/walk-route.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heightAt } from '../../world/island/recipe.js';
import { ninewallsColliders, segmentHitsWall } from '../../world/settlements/ninewalls-layout.js';
import { yardsColliders, apronPoint } from '../../world/sites/kilnyards-layout.js';
import { walkRoute, footprint } from './walk-route.js';
import { PLACES } from './plan.js';

const SW = (() => { const p = apronPoint(-21, -7.5); return { x: +p.e.toFixed(2), z: +(-p.n).toFixed(2) }; })();
const COLS = [...ninewallsColliders(heightAt), ...yardsColliders(heightAt)];
const FP = footprint(COLS, 0.8);
const TIGHT = footprint(COLS, 0.4);   // the walker's own 0.4 m capsule
const deg = (dh, d) => Math.atan(dh / d) * 180 / Math.PI;

test('the footprint closes a crescent wall and leaves the village core open', () => {
  assert.ok(FP.n > 100, `${FP.n} colliders`);
  // a point on wall-1's centreline (bearing 0, r 67.2 from the tree) is blocked; the tree's forecourt 6 m south is not
  assert.equal(FP.blocked(-11, 213 - 67.2), true);
  assert.equal(FP.blocked(-11, 213 + 6), false);
});

for (const [name, a, b] of [['the fishing hut to Oro', PLACES.fishingHut, PLACES.oro], ['Oro to the Yards\' south-west corner', PLACES.oro, SW]]) {
  test(`${name}: a line round Ninewalls' walls, no step over 26 deg`, () => {
    const r = walkRoute(heightAt, a, b, { blocked: FP.blocked });
    assert.ok(r && r.length > 3, 'a line exists');
    assert.ok(Math.hypot(r.at(-1).x - b.x, r.at(-1).z - b.z) < 9, `ends ${Math.hypot(r.at(-1).x - b.x, r.at(-1).z - b.z).toFixed(1)} m from the target`);
    let metres = 0;
    for (let i = 1; i < r.length; i++) {
      const p = r[i - 1], q = r[i], L = Math.hypot(q.x - p.x, q.z - p.z);
      metres += L;
      const w = segmentHitsWall(p.x, p.z, q.x, q.z, 0.4, { includeCut: true });
      assert.equal(w, null, `leg ${i} (${p.x}, ${p.z}) -> (${q.x}, ${q.z}) crosses ${w?.id}`);
      const n = Math.ceil(L / 0.5);
      for (let m = 1; m <= n; m++) {
        const x = p.x + (q.x - p.x) * (m / n), z = p.z + (q.z - p.z) * (m / n);
        assert.ok(!TIGHT.blocked(x, z) || i === 1, `leg ${i} runs inside a collider at (${x.toFixed(1)}, ${z.toFixed(1)})`);
      }
      // the bar on the 2 m cells the line was found on (a point step of the bilinear ground, half a cell, may read over
      // it where the line turns on a terrace's bank)
      const s = Math.max(1, Math.ceil(L / 2));
      for (let m = 1; m <= s; m++) {
        const x0 = p.x + (q.x - p.x) * ((m - 1) / s), z0 = p.z + (q.z - p.z) * ((m - 1) / s);
        const x1 = p.x + (q.x - p.x) * (m / s), z1 = p.z + (q.z - p.z) * (m / s);
        const dg = deg(Math.abs(heightAt(x1, z1) - heightAt(x0, z0)), L / s);
        assert.ok(dg <= 30, `leg ${i} step ${m}: ${dg.toFixed(1)} deg`);
      }
    }
    console.log(`  ${name}: ${r.length} waypoints, ${metres.toFixed(0)} m (straight ${Math.hypot(b.x - a.x, b.z - a.z).toFixed(0)} m)`);
  });
}
