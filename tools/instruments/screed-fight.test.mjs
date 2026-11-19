/**
 * THE SCREED FIGHT on Ninewalls' walls, the Node twin of the live Screed (M2 wave 3, area C; src/instruments/kinds/
 * screed.js runs screed-rules.js ScreedFight, the same code): node --test tools/instruments/screed-fight.test.mjs
 *
 * On area B's nine walls as built (src/world/settlements/ninewalls-layout.js), simulation time (1/60 s), the Screed
 * stood where the first hour stands it up (src/game/hour.js: compass bearing 45 deg from the village's centre,
 * OUTER_R + 14 m out, facing the centre).
 *   1. THE WALL TRICK: she stands between it and the outer wall, 9-10 m in front of it, and sidesteps 4 m during its
 *      1.2 s wind-up. The committed charge holds its heading (IN5 < 3 deg), misses her, meets the whole outer wall and
 *      stalls 3.0 s +-0.2 ('screed-stalled' { wall }); in the stall she works the seals (Brine and the Pry on the left ram,
 *      two arrows on the right: 'seal-off' ram-1, then ram-2), the blade drops, the fight is done without a wall cut, and it walks back out, cutting nothing.
 *   2. STANDING STILL in front of it is a blade blow ('blade-hit'), and the charge still stalls on the wall behind her.
 *   3. FAIL-SOFT: struck once from far off and left alone, it walks in and cuts three walls ('screed-cut' 1-3), the fight
 *      ends fail-soft, and it walks back out through its own cuts (no fourth wall cut).
 *   4. BRINE, THEN PRY OR HOOK-RIP: a seized seal comes off with one blow ('screed-seized', then 'seal-off').
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ScreedBrain, ScreedFight, SCREED_RULES } from '../../src/instruments/kinds/screed-rules.js';
import * as NW from '../../src/world/settlements/ninewalls-layout.js';
import { SCAR } from '../../src/world/island/sites.js';

const DT = 1 / 60, D2R = Math.PI / 180;
const C = NW.CENTRE;

function stoodUp() {
  NW.resetWalls();
  const r = NW.OUTER_R + 14, b = 45 * D2R;
  const at = { x: C.x + Math.sin(b) * r, z: C.z - Math.cos(b) * r };
  const brain = new ScreedBrain({ x: at.x, z: at.z, heading: Math.atan2(C.x - at.x, C.z - at.z), walls: NW });
  const fight = new ScreedFight(brain, { centre: { x: C.x, z: C.z }, away: [{ x: at.x, z: at.z }, { x: SCAR.b.x, z: SCAR.b.z }] });
  return { brain, fight, at, b };
}

/** Run `secs` of sim time with her at `herAt(t)`; collect every event with its time. */
function run(F, secs, herAt, t0 = 0) {
  const out = [];
  let t = t0;
  for (let i = 0; i < secs / DT; i++) {
    t += DT;
    const p = herAt(t);
    for (const e of F.fight.step(DT, p ? p.x : null, p ? p.z : null)) out.push({ ...e, t: +t.toFixed(3), x: +F.brain.x.toFixed(2), z: +F.brain.z.toFixed(2), heading: F.brain.heading });
  }
  return { events: out, t };
}

test('the wall trick: a sidestep in the wind-up, the charge holds its line, misses her and stalls 3.0 s on the outer wall; the seals off in the stall drop the blade; no wall cut', () => {
  const F = stoodUp();
  const fx = Math.sin(F.brain.heading), fz = Math.cos(F.brain.heading), rx = fz, rz = -fx;
  // she stands 9.5 m in front of it (between it and the outer wall); at 0.5 s into the wind-up she steps 4 m to its right
  const stand = { x: F.at.x + fx * 9.5, z: F.at.z + fz * 9.5 };
  let windupAt = null;
  const herAt = (t) => (windupAt !== null && t > windupAt + 0.5 ? { x: stand.x + rx * 4, z: stand.z + rz * 4 } : stand);
  const evs = [];
  const sealEvents = [];
  let t = 0;
  for (let i = 0; i < 12 / DT; i++) {
    t += DT;
    const p = herAt(t);
    let stalled = false;
    for (const e of F.fight.step(DT, p.x, p.z)) { evs.push({ ...e, t, heading: F.brain.heading }); if (e.type === 'screed-charge') windupAt = t; if (e.type === 'screed-stalled') stalled = true; }
    // in the stall she works the seals: Brine on the left ram, the Pry; two arrows on the right one
    if (stalled) {
      for (const [id, k] of [['sealL', 'brine'], ['sealL', 'pry'], ['sealR', 'precision'], ['sealR', 'precision']]) { F.fight.blow(id, k); sealEvents.push(...F.fight.events); }
    }
  }
  const names = evs.map((e) => e.type);
  assert.ok(names.includes('screed-engage'), 'the fight starts when she is near');
  const ch = evs.find((e) => e.type === 'screed-charge');
  assert.ok(ch, 'it charges her');
  const st = evs.find((e) => e.type === 'screed-stalled');
  assert.ok(st, `the charge stalls on a wall (events ${names.join(', ')})`);
  assert.equal(st.wall, 'wall-1', `on the outer wall, not ${st.wall}`);
  assert.ok(!names.includes('blade-hit'), 'her sidestep cleared the blade');
  // IN5: the committed heading
  const stall = F.brain.stalls[0];
  assert.ok(stall, 'the brain recorded the stall');
  // (the charge event carries the heading at the wind-up's start: the wind-up turns it onto her, so compare the stall
  // with the commit, the first step of the charge phase: the brain's lockedHeading)
  const dev = Math.abs(st.heading - F.brain.lockedHeading) / D2R;
  assert.ok(dev < 3, `heading deviated ${dev.toFixed(2)} deg once committed`);
  // the stall's length (IN5: 3.0 s +-0.2), timed on the brain's phase
  let stallS = 0;
  const F2 = stoodUp(); let w2 = null; let inStall = false, stallStart = 0;
  const her2 = (tt) => (w2 !== null && tt > w2 + 0.5 ? { x: stand.x + rx * 4, z: stand.z + rz * 4 } : stand);
  for (let i = 0, tt = 0; i < 12 / DT; i++) {
    tt += DT;
    const p = her2(tt);
    for (const e of F2.fight.step(DT, p.x, p.z)) if (e.type === 'screed-charge') w2 = tt;
    if (F2.brain.phase === 'stall' && !inStall) { inStall = true; stallStart = tt; }
    if (inStall && F2.brain.phase !== 'stall' && stallS === 0) stallS = tt - stallStart;
  }
  assert.ok(Math.abs(stallS - SCREED_RULES.stallS) <= 0.2 + 1e-9, `stalled ${stallS.toFixed(3)} s`);
  // the seals came off in the stall
  const offs = sealEvents.filter((e) => e.type === 'seal-off');
  assert.deepEqual(offs.map((e) => e.seal), ['ram-1', 'ram-2'], `seal-off events ${JSON.stringify(offs)}`);
  // the blade drops, the fight is done, it walks out cutting nothing
  const after = run(F, 40, () => stand, t);
  assert.ok([...evs, ...after.events].some((e) => e.type === 'screed-done' && e.sealsOff && !e.failSoft), 'done with the seals off, not fail-soft');
  assert.equal(F.brain.cuts.length, 0, `walls cut: ${F.brain.cuts}`);
  assert.ok(!after.events.some((e) => e.type === 'screed-charge') && evs.filter((e) => e.type === 'screed-charge').length === 1, 'no charge once the blade is down');
  assert.equal(F.brain.bladeY, SCREED_RULES.bladeDrop, 'the blade sits dropped');
});

test('standing still in front of it is a blade blow; the charge still stalls on the wall behind her', () => {
  const F = stoodUp();
  const fx = Math.sin(F.brain.heading), fz = Math.cos(F.brain.heading);
  const stand = { x: F.at.x + fx * 10, z: F.at.z + fz * 10 };
  const r = run(F, 8, () => stand);
  const names = r.events.map((e) => e.type);
  assert.ok(names.includes('blade-hit'), `the blade hits her (events ${names.join(', ')})`);
  assert.equal(names.filter((n) => n === 'blade-hit').length, 1, 'once a charge');
  assert.ok(r.events.some((e) => e.type === 'screed-stalled' && e.wall === 'wall-1'), 'and stalls on the outer wall');
});

test('fail-soft: struck once and left alone it cuts three walls, the fight ends fail-soft, and it walks out through its own cuts', () => {
  const F = stoodUp();
  F.fight.struck = true;
  const far = { x: F.at.x + 200, z: F.at.z + 200 };
  const r = run(F, 120, () => far);
  const cuts = r.events.filter((e) => e.type === 'screed-cut').map((e) => e.id);
  assert.deepEqual(cuts, ['wall-1', 'wall-2', 'wall-3'], `cut ${cuts}`);
  const done = r.events.find((e) => e.type === 'screed-done');
  assert.ok(done && done.failSoft && done.cuts === 3, `done ${JSON.stringify(done)}`);
  assert.equal(F.brain.cuts.length, 3, 'no fourth wall');
  assert.ok(Math.hypot(F.brain.x - F.at.x, F.brain.z - F.at.z) < 30 || F.fight.awayI === 1, 'walking back out');
  for (const id of ['wall-1', 'wall-2', 'wall-3']) assert.equal(NW.wallState(id).state, 'cut');
  assert.equal(NW.wallState('wall-4').state, 'whole');
});

test('Brine seizes a seal; one Pry or one hook-rip takes it off', () => {
  for (const tool of ['pry', 'hookRip']) {
    const F = stoodUp();
    assert.equal(F.fight.blow('sealL', tool), 'sealed', `${tool} on a sealed seal does nothing`);
    assert.equal(F.fight.blow('sealL', 'brine'), 'seized');
    assert.ok(F.fight.events.some((e) => e.type === 'screed-seized' && e.part === 'sealL'));
    assert.equal(F.fight.blow('sealL', tool), 'off');
    assert.ok(F.fight.events.some((e) => e.type === 'seal-off' && e.seal === 'ram-1' && e.part === 'sealL'));
    assert.ok(F.fight.struck, 'a blow on a part starts the fight');
  }
});
