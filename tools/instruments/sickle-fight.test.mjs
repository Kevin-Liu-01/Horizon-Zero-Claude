/**
 * THE SICKLE PACK'S FIGHT, the Node twin of the live Sickle (M2 wave 3, area C; src/instruments/kinds/sickle.js runs
 * sickle-rules.js SickleFight and SicklePack, the same code): node --test tools/instruments/sickle-fight.test.mjs
 *
 * Three Sickles stood up 20 m from her inside the Holds, simulation time (1/60 s), 40 s:
 *   - the pack engages and circles her: every member not in a move (and 3 s past its last one: a lunge ends at her and
 *     it walks back out) stands 6-14.5 m from her (its 9-14 m ring, less the 3 m feint); no two members are ever in a
 *     move at once;
 *   - it attacks in turn: at least one Clearcut and one Scissor Lunge, each member taking a turn;
 *   - IN8 on the pack: the hub bearing is exposed exactly in each Clearcut wind-up (0.6 s); a scripted shot at the hub
 *     from 8 m hits in 8+ of 10 inside the window and 0 of 10 outside it; every lunge carries the hull 8 m;
 *   - outside its arena (the line-up on the Pans) a pack never starts a fight.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SickleBrain, SicklePack, SickleFight, SICKLE_RULES } from '../../src/instruments/kinds/sickle-rules.js';
import { CENTRE } from '../../src/world/settlements/ninewalls-layout.js';

const DT = 1 / 60;
const ARENA = { x: CENTRE.x, z: CENTRE.z, r: 220 };

function pack3(her, arena = ARENA) {
  const pack = new SicklePack();
  const ms = [0, 1, 2].map((i) => {
    const a = 0.5 + i * 2.1, b = new SickleBrain({ x: her.x + Math.sin(a) * 20, z: her.z + Math.cos(a) * 20, heading: a + Math.PI });
    return { b, f: new SickleFight(b, pack, { arena }) };
  });
  return { pack, ms };
}

test('a pack of three circles her at its rings, attacks one at a time, Clearcut and the Scissor Lunge in turn', () => {
  const her = { x: CENTRE.x + 10, z: CENTRE.z - 75 };
  const { pack, ms } = pack3(her);
  let maxConcurrent = 0, ringMin = Infinity, ringMax = 0, engagedAt = null;
  const moves = [], who = new Set(), lunges = [];
  const hits = { in: 0, inN: 0, out: 0, outN: 0 };
  let blows = 0;
  for (let i = 0, t = 0; i < 40 / DT; i++) {
    t += DT;
    pack.step(DT);
    let concurrent = 0;
    for (const [k, m] of ms.entries()) {
      const x0 = m.b.x, z0 = m.b.z;
      for (const e of m.f.step(DT, her.x, her.z)) {
        if (e.type === 'sickle-engage' && engagedAt === null) engagedAt = t;
        if (e.type === 'sickle-clearcut' || e.type === 'sickle-lunge') { moves.push(e.type); who.add(k); if (e.type === 'sickle-lunge') lunges.push({ m, x: x0, z: z0 }); }
        if (e.type === 'blade-hit') blows++;
      }
      if (m.b.move) { concurrent++; m.lastMoveT = t; }
      // on its ring: 4 s into the fight and 3 s after its last move (a lunge ends at her; it walks back out)
      else if (t > 4 && t - (m.lastMoveT ?? -99) > 3) { const d = Math.hypot(m.b.x - her.x, m.b.z - her.z); ringMin = Math.min(ringMin, d); ringMax = Math.max(ringMax, d); }
      // IN8, scripted shots at the hub from 8 m in front of the hull (one every 6th step)
      if (i % 6 === 0 && m.b.move === 'clearcut') {
        const h = m.b.hubWorld(), s = Math.sin(m.b.heading), c = Math.cos(m.b.heading);
        const ax = h.x + s * 8, az = h.z + c * 8, inWin = m.b.hubExposed();
        const hit = m.b.shotHits(ax, h.y + 0.2, az, h.x - s * 0.5, h.y - 0.0125, h.z - c * 0.5);
        if (inWin) { hits.inN++; if (hit) hits.in++; } else { hits.outN++; if (hit) hits.out++; }
      }
    }
    maxConcurrent = Math.max(maxConcurrent, concurrent);
  }
  assert.ok(engagedAt !== null && engagedAt < 0.1, 'the pack engages her at once (20 m < 22 m)');
  assert.equal(maxConcurrent, 1, 'one member in a move at a time');
  assert.ok(moves.includes('sickle-clearcut') || moves.includes('sickle-lunge'), `moves ${moves}`);
  assert.ok(moves.includes('sickle-lunge'), `a Scissor Lunge among ${moves}`);
  assert.equal(who.size, 3, `every member takes a turn (${[...who]})`);
  assert.ok(ringMin >= 6 - 1e-6 && ringMax <= 14.5, `ring distances ${ringMin.toFixed(2)}-${ringMax.toFixed(2)} m`);
  assert.ok(blows > 0, 'a blade reaches her when she stands still');
  if (hits.inN) assert.ok(hits.in / hits.inN >= 0.8, `hub shots in the window ${hits.in}/${hits.inN}`);
  assert.equal(hits.out, 0, `hub shots outside the window ${hits.out}/${hits.outN}`);
});

test('IN8 window on a pack member: 10 shots in the Clearcut wind-up, 10 outside', () => {
  const her = { x: CENTRE.x, z: CENTRE.z - 80 };
  const pack = new SicklePack();
  const b = new SickleBrain({ x: her.x, z: her.z - 3, heading: 0 });
  const f = new SickleFight(b, pack, { arena: ARENA });
  pack.cd = 0;
  f.step(DT, her.x, her.z);                 // engage
  pack.step(DT); f.step(DT, her.x, her.z);  // 3 m from her: its turn, a Clearcut
  assert.equal(b.move, 'clearcut');
  let inHits = 0, outHits = 0, inN = 0, outN = 0;
  for (let i = 0; i < 200 && (inN < 10 || outN < 10); i++) {
    const h = b.hubWorld(), s = Math.sin(b.heading), c = Math.cos(b.heading);
    const hit = b.shotHits(h.x + s * 8, h.y, h.z + c * 8, h.x - s * 0.4, h.y, h.z - c * 0.4);
    if (b.hubExposed()) { if (inN < 10 && i % 3 === 0) { inN++; if (hit) inHits++; } } else if (outN < 10 && i % 3 === 0) { outN++; if (hit) outHits++; }
    pack.step(DT); f.step(DT, her.x, her.z);
  }
  assert.ok(inN === 10 && inHits >= 8, `in the window ${inHits}/${inN}`);
  assert.equal(outHits, 0, `outside it ${outHits}/${outN}`);
});

test('the Scissor Lunge carries the hull 8 m on its committed heading', () => {
  const b = new SickleBrain({ x: 0, z: 0, heading: 0.7 });
  b.lunge(0.7);
  for (let i = 0; i < 120; i++) b.step(DT);
  assert.ok(Math.abs(Math.hypot(b.x, b.z) - SICKLE_RULES.lungeLen) < 1e-6, `dash ${Math.hypot(b.x, b.z)}`);
  assert.ok(Math.abs(Math.atan2(b.x, b.z) - 0.7) < 1e-9);
});

test('outside its arena (the line-up on the Pans) a pack never starts a fight', () => {
  const her = { x: -310, z: 265 };
  const { pack, ms } = pack3(her);
  for (let i = 0; i < 300; i++) { pack.step(DT); for (const m of ms) m.f.step(DT, her.x, her.z); }
  for (const m of ms) assert.equal(m.f.mode, 'wait');
});
