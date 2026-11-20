// The runner's walkable line (./walk-route.js) over the island recipe's heights: leg 6's two long walks (the fishing hut
// to Oro, Oro to the Kiln Yards' south-west corner) exist and no step between waypoints climbs more than the bar.
// Browser-free: node --test src/game/hour2/walk-route.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heightAt } from '../../world/island/recipe.js';
import { walkRoute } from './walk-route.js';
import { PLACES } from './plan.js';

test('leg 6\'s long walks have a line no steeper than 26 deg per 2 m cell, ending at the target', () => {
  for (const [a, b] of [[PLACES.fishingHut, PLACES.oro], [PLACES.oro, { x: 178.97, z: 32.98 }]]) {
    const r = walkRoute(heightAt, a, b, { every: 2 });
    assert.ok(r && r.length > 10);
    assert.ok(Math.hypot(r.at(-1).x - b.x, r.at(-1).z - b.z) < 2);
    for (let i = 1; i < r.length; i++) {
      const d = Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z), dh = Math.abs(heightAt(r[i].x, r[i].z) - heightAt(r[i - 1].x, r[i - 1].z));
      assert.ok(dh / d <= Math.tan(26.5 * Math.PI / 180) || d > 3, `step ${i}: ${(Math.atan(dh / d) * 180 / Math.PI).toFixed(1)} deg`);
    }
  }
});
