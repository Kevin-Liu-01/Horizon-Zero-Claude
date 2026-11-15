// M1.6e reed cover: the one mask, the gust clock of bible §14, the rule, the Peg cut. Browser-free:
//   node --test tools/gates/systems/reed-cover.test.mjs
// The live rows (a real Plumb at 15 m, a crouch-walk in a gust, in a lull, in the meadow; the lean drawn against the
// 4 m/s crossing; a swarm's lane in the reeds) are tools/gates/systems/reed-probe-page.mjs, run on F31 by film.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heightAt, authored } from '../../../src/world/island/recipe.js';
import { ReedMask, BEDS, REED_KIND, REED_MASK, COVER_LINE } from '../../../src/world/island/reedmask.js';
import { GustClock, GUST } from '../../../src/game/reeds/gust.js';
import { reedHidden, inCover } from '../../../src/game/reeds/rule.js';
import { GLASS_RIM } from '../../../src/world/island/bake.js';

const mask = new ReedMask(heightAt);

test('one 256 x 256 mask (two bytes a cell) carries carrizo and junco beds by the Glass', () => {
  assert.equal(REED_MASK.n, 256);
  assert.equal(mask.base.length, 256 * 256 * 2);
  const s = mask.stats();
  assert.ok(s.carrizoM2 > 1500, `carrizo ${s.carrizoM2} m2`);
  assert.ok(s.juncoM2 > 150, `junco ${s.juncoM2} m2`);
  assert.equal(BEDS.filter((b) => b.kind === REED_KIND.CARRIZO).length, 8);
  // the F31 place (look.reed) stands in dense carrizo
  assert.ok(mask.cover(-406, 196) >= 0.9);
  assert.equal(mask.bedAt(-406, 196).kind, REED_KIND.CARRIZO);
});

test('the meadow never hides: no reed cell lies on meadow ground (bake: the meadow starts at the Glass rim 1.95)', () => {
  let onMeadow = 0, n = 0;
  for (let j = 0; j < 256; j += 2) for (let i = 0; i < 256; i += 2) {
    const o = (j * 256 + i) * 2;
    if (!mask.base[o]) continue;
    n++;
    const x = mask.x0 + (i + 0.5) * 0.5, z = mask.z0 + (j + 0.5) * 0.5;
    if (authored.glass(x, z) >= GLASS_RIM) onMeadow++;
  }
  assert.ok(n > 1000);
  assert.equal(onMeadow, 0);
});

test('the gust clock: 9 s gust and 5 s lull (each +-1), 5-7 and 1.5-3 m/s plateaux, period 14 +-2', () => {
  for (let b = 0; b < BEDS.length; b++) {
    const c = new GustClock(BEDS[b].seed, b);
    const sp = c.spans(100, 400);
    const gusts = sp.filter((s) => s.gust && s.start > 100 && s.end < 400), lulls = sp.filter((s) => !s.gust && s.start > 100 && s.end < 400);
    assert.ok(gusts.length >= 18);
    for (const g of gusts) {
      const d = g.end - g.start;
      assert.ok(d >= 8 - 1e-9 && d <= 10 + 1e-9, `gust ${d}`);
      // >= 4 m/s through the whole span, below it just outside
      for (let t = g.start + 0.01; t < g.end - 0.01; t += 0.05) assert.ok(c.speed(t) >= GUST.on - 1e-9);
      assert.ok(c.speed(g.start - 0.02) < GUST.on && c.speed(g.end + 0.02) < GUST.on);
      const mid = c.speed((g.start + g.end) / 2);
      assert.ok(mid >= 5 - 1e-9 && mid <= 7 + 1e-9, `gust plateau ${mid}`);
    }
    for (const l of lulls) {
      const d = l.end - l.start;
      assert.ok(d >= 4 - 1e-9 && d <= 6 + 1e-9, `lull ${d}`);
      const mid = c.speed((l.start + l.end) / 2);
      assert.ok(mid >= 1.5 - 1e-9 && mid <= 3 + 1e-9, `lull plateau ${mid}`);
    }
    const mean = (a) => a.reduce((x, s) => x + s.end - s.start, 0) / a.length;
    assert.ok(Math.abs(mean(gusts) - 9) < 0.6 && Math.abs(mean(lulls) - 5) < 0.6);
  }
});

test('calima lull 8 s, night gust 7 s', () => {
  const cal = new GustClock(1, 0, () => ({ calima: true, night: false }));
  const night = new GustClock(1, 0, () => ({ calima: false, night: true }));
  const l = cal.spans(50, 300).filter((s) => !s.gust && s.start > 50 && s.end < 300);
  const g = night.spans(50, 300).filter((s) => s.gust && s.start > 50 && s.end < 300);
  for (const s of l) assert.ok(Math.abs(s.end - s.start - 8) <= 1 + 1e-9);
  for (const s of g) assert.ok(Math.abs(s.end - s.start - 7) <= 1 + 1e-9);
});

test('phase seeded per bed: no two beds are in step (every gust start of every pair >= 0.5 s apart over 600 s)', () => {
  const starts = BEDS.map((b, i) => new GustClock(b.seed, i).spans(60, 660).filter((s) => s.gust).map((s) => s.start));
  let worst = Infinity;
  for (let a = 0; a < starts.length; a++) for (let b = a + 1; b < starts.length; b++)
    for (const x of starts[a]) for (const y of starts[b]) worst = Math.min(worst, Math.abs(x - y));
  assert.ok(worst >= 0.5, `closest gust starts of two beds: ${worst} s`);
});

test('the canes begin to lean 0.8 s +- 0.1 before the wind reaches 4 m/s (60 Hz)', () => {
  const c = new GustClock(BEDS[3].seed, 3);
  const leads = [];
  let lastLull = null, onset = null, prevS = c.speed(0);
  for (let f = 1; f < 60 * 300; f++) {
    const t = f / 60, s = c.speed(t), L = c.lean(t);
    if (L <= GUST.leanLull + 1e-6) { lastLull = t; onset = null; }
    else if (onset === null && lastLull !== null) onset = t;
    if (prevS < GUST.on && s >= GUST.on && onset !== null) leads.push(t - onset);
    prevS = s;
  }
  assert.ok(leads.length >= 15);
  for (const d of leads) assert.ok(Math.abs(d - 0.8) <= 0.1, `lead ${d}`);
});

test('the rule: carrizo standing, junco and marram crouched; still or a gust; never the meadow', () => {
  const C = REED_KIND.CARRIZO, J = REED_KIND.JUNCO, Mr = REED_KIND.MARRAM, N = REED_KIND.NONE;
  assert.ok(reedHidden(C, 0.8, false, 0, 2));        // standing still in carrizo, lull
  assert.ok(!reedHidden(C, 0.8, false, 1.4, 2));     // moving in a lull
  assert.ok(reedHidden(C, 0.8, false, 1.4, 5));      // moving in a gust
  assert.ok(reedHidden(C, 0.8, true, 1.4, 4.0));     // crouch-walking at the line
  assert.ok(!reedHidden(J, 0.8, false, 0, 6));       // junco standing
  assert.ok(reedHidden(J, 0.8, true, 1.4, 6));
  assert.ok(reedHidden(Mr, 0.8, true, 0, 1));
  assert.ok(!reedHidden(Mr, 0.8, false, 0, 6));
  assert.ok(!reedHidden(N, 1, true, 0, 7));          // the meadow / open ground
  assert.ok(!inCover(C, COVER_LINE - 0.01, true));   // thinner than the line
});

test('a Peg cut lowers the cover in a 1.0 m +- 0.2 lane, and the lane hides nobody', () => {
  const m = new ReedMask(heightAt);
  // across the F31 bed: a 10 m segment through dense carrizo
  const x0 = -412, z0 = 199, x1 = -403, z1 = 194;
  m.cutCover([x0, z0, x1, z1], 1.0);
  const L = Math.hypot(x1 - x0, z1 - z0), nx = -(z1 - z0) / L, nz = (x1 - x0) / L;
  for (const t of [0.25, 0.5, 0.75]) {
    const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    const q = m.cuts.laneAt(x, z, nx, nz, 1.4);
    assert.ok(Math.abs(q.run - 1.0) <= 0.2, `run ${q.run}`);
    assert.ok(Math.abs(q.integral - 1.0) <= 0.2, `integral ${q.integral}`);
    assert.ok(m.cover(x, z) < COVER_LINE, 'the lane is open');
    assert.ok(!reedHidden(REED_KIND.CARRIZO, m.cover(x, z), true, 0, 7));
  }
  assert.ok(m.version === 1 && m.dirty);
});
