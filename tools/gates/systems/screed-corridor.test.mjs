/**
 * THE SCREED FROM INSIDE THE WALLS (M2 fix wave 2, area E): the fight as tools/gates/systems/first-hour.mjs plays it by
 * input, on the Screed's own rules (src/instruments/kinds/screed-rules.js ScreedFight, the code the live Screed runs) and
 * area B's nine walls, on simulation time (1/60 s). The Node twin (tools/instruments/screed-fight.test.mjs) stands her
 * between it and the outer wall; from Oro, inside the ninth wall, that place is round the walls' ends and the Screed
 * engages her at 45 m on the way (at 02f7125 it then cut three walls with no charge). Here she comes in by the corridor
 * between the outer wall and the second, as the runner does:
 *   1. STALL: 4.5 deg past its bearing in the corridor, the whole outer wall between them, its charge at her meets the
 *      outer wall ('screed-stalled' wall-1) and no blade reaches her.
 *   2. THE SEAL STALL: it cuts the outer wall and comes into the corridor; she waits off its line 10 m in front and 5 m
 *      to one side (on the corridor's floor), steps 5.5 m square out of its line in its wind-up, and its charge meets the
 *      second wall beside her ('screed-stalled' wall-2): no blade hit, she stands within 8 m of it with no wall between,
 *      and its rams stay on her side of the second wall for at least 5 s (the stall, the back-off and the walk back in).
 *   node --test tools/gates/systems/screed-corridor.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ScreedBrain, ScreedFight, SCREED_RULES } from '../../../src/instruments/kinds/screed-rules.js';
import * as NW from '../../../src/world/settlements/ninewalls-layout.js';
import { SCAR } from '../../../src/world/island/sites.js';

const DT = 1 / 60, D2R = Math.PI / 180, C = NW.CENTRE;
const W1 = NW.WALLS[0], W2 = NW.WALLS[1];
const rIn = W2.r + W2.t / 2, rOut = W1.r - W1.t / 2, rMid = (rIn + rOut) / 2;

function stoodUp() {
  NW.resetWalls();
  const r = NW.OUTER_R + 14, b = 45 * D2R;
  const at = { x: C.x + Math.sin(b) * r, z: C.z - Math.cos(b) * r };
  const brain = new ScreedBrain({ x: at.x, z: at.z, heading: Math.atan2(C.x - at.x, C.z - at.z), walls: NW });
  const fight = new ScreedFight(brain, { centre: { x: C.x, z: C.z }, arena: { x: C.x, z: C.z, r: 160 }, away: [{ x: at.x, z: at.z }, { x: SCAR.b.x, z: SCAR.b.z }] });
  return { brain, fight, at };
}

/** Her frame against the Screed's heading: how far in front, and to which side (+ right), as the runner reads it. */
const frame = (b, p) => { const s = Math.sin(b.heading), c = Math.cos(b.heading), ex = p.x - b.x, ez = p.z - b.z; return { ahead: ex * s + ez * c, side: ex * c - ez * s }; };

test('from the corridor inside the outer wall: the charge at her stalls on the outer wall, then on the second wall beside her', () => {
  const F = stoodUp(), b = F.brain;
  const bS = NW.bearingOf(b.x, b.z);
  // 1. she walks the corridor from its east mouth at 6 m/s to 4.5 deg past its bearing
  const stand = NW.polar(bS + 4.5, rMid);
  let her = NW.polar((W1.to + W2.to) / 2, rMid), t = 0;
  const evs = [];
  let stall1 = null;
  for (let i = 0; i < 40 / DT && !stall1; i++) {
    t += DT;
    const bh = NW.bearingOf(her.x, her.z);
    if (bh > bS + 4.5) her = NW.polar(Math.max(bS + 4.5, bh - (6 * DT / rMid) / D2R), rMid);
    for (const e of F.fight.step(DT, her.x, her.z)) { evs.push({ ...e, t }); if (e.type === 'screed-stalled') stall1 = { ...e, t }; }
  }
  assert.ok(stall1, `no stall (events ${evs.map((e) => e.type).join(', ')})`);
  assert.equal(stall1.wall, 'wall-1', `stalled on ${stall1.wall}`);
  assert.ok(!evs.some((e) => e.type === 'blade-hit'), 'the blade reached her through the wall');
  assert.equal(b.cuts.length, 0, 'no wall cut before it');
  assert.ok(Math.hypot(her.x - stand.x, her.z - stand.z) < 0.5, 'she stood at her place');
  // 2. the seal stall
  let sidestep = null, stall2 = null, side0 = 0;
  const evs2 = [];
  for (let i = 0; i < 40 / DT && !stall2; i++) {
    t += DT;
    const fr = frame(b, her);
    if (b.phase === 'windup' && !sidestep && fr.ahead > -2 && fr.ahead < 28 && Math.abs(fr.side) < 4.2 && !NW.segmentHitsWall(b.x, b.z, her.x, her.z, 0)) {
      // the side she leans to, unless that step leaves the corridor's floor (as first-hour.mjs chooses it)
      const at = (sg) => ({ x: her.x + Math.cos(b.heading) * sg * 5.5, z: her.z - Math.sin(b.heading) * sg * 5.5 });
      const onFloor = (q) => { const r = Math.hypot(q.x - C.x, q.z - C.z); return r > rIn + 0.6 && r < rOut - 0.8; };
      let sg = fr.side >= 0 ? 1 : -1;
      if (!onFloor(at(sg)) && onFloor(at(-sg))) sg = -sg;
      sidestep = { t, from: { ...her }, to: at(sg), sg };
    }
    if (sidestep) {
      const u = Math.min(1, (t - sidestep.t) / 0.9);
      her = { x: sidestep.from.x + (sidestep.to.x - sidestep.from.x) * u, z: sidestep.from.z + (sidestep.to.z - sidestep.from.z) * u };
    } else if (b.phase === 'walk' || b.phase === 'stall') {
      // 10 m in front of it and 5 m to the side she leans to, on the corridor's floor, walked to at 6 m/s
      const sg = (side0 = fr.side >= 0 ? 1 : -1), rx = Math.cos(b.heading) * sg, rz = -Math.sin(b.heading) * sg;
      let gx = b.x + Math.sin(b.heading) * 10 + rx * 5, gz = b.z + Math.cos(b.heading) * 10 + rz * 5;
      const gb = NW.bearingOf(gx, gz), gr = Math.min(rOut - 2.2, Math.max(rIn + 1.3, Math.hypot(gx - C.x, gz - C.z)));
      ({ x: gx, z: gz } = NW.polar(gb, gr));
      const dx = gx - her.x, dz = gz - her.z, L = Math.hypot(dx, dz);
      if (L > 0.05) { const k = Math.min(1, 6 * DT / L); her = { x: her.x + dx * k, z: her.z + dz * k }; }
    }
    { const hb = NW.bearingOf(her.x, her.z), hr = Math.min(rOut - 0.4, Math.max(rIn + 0.4, Math.hypot(her.x - C.x, her.z - C.z))); her = NW.polar(hb, hr); }   // the walls stop her
    for (const e of F.fight.step(DT, her.x, her.z)) { evs2.push({ ...e, t }); if (e.type === 'screed-stalled') stall2 = { ...e, t }; }
  }
  assert.ok(stall2, `no second stall (events ${evs2.map((e) => e.type).join(', ')})`);
  assert.equal(stall2.wall, 'wall-2', `stalled on ${stall2.wall}`);
  assert.ok(sidestep, 'she stepped out of its line in its wind-up');
  assert.ok(!evs2.some((e) => e.type === 'blade-hit'), 'the blade reached her');
  assert.deepEqual(b.cuts, ['wall-1'], `cuts ${b.cuts}`);
  const d = Math.hypot(her.x - b.x, her.z - b.z);
  assert.ok(d < 8, `she stands ${d.toFixed(1)} m from it`);
  const between = NW.segmentHitsWall(b.x, b.z, her.x, her.z, 0);
  assert.equal(between, null, `a whole wall between them: ${JSON.stringify(between)} (it at r ${Math.hypot(b.x - C.x, b.z - C.z).toFixed(1)} b ${NW.bearingOf(b.x, b.z).toFixed(1)}, she r ${Math.hypot(her.x - C.x, her.z - C.z).toFixed(1)} b ${NW.bearingOf(her.x, her.z).toFixed(1)})`);
  // the rams (1.5 m behind the blade's face, sim time) stay on her side of the second wall
  const ramsIn = () => Math.hypot(b.x + Math.sin(b.heading) * (SCREED_RULES.bladeFront - 1.5) - C.x, b.z + Math.cos(b.heading) * (SCREED_RULES.bladeFront - 1.5) - C.z) > W2.r + W2.t / 2;
  let window = 0;
  for (let i = 0; i < 15 / DT && ramsIn(); i++) { F.fight.step(DT, her.x, her.z); window += DT; }
  assert.ok(window >= 5, `the rams on her side ${window.toFixed(2)} s`);
  console.log(`# stall 1 at ${stall1.t.toFixed(1)} s on ${stall1.wall}; stall 2 at ${stall2.t.toFixed(1)} s on ${stall2.wall}, she ${d.toFixed(1)} m off; the rams on her side ${window.toFixed(2)} s`);
});
