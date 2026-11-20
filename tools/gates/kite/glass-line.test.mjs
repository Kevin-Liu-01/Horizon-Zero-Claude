// M3 wave 3, area B: "A Line Over the Glass" walked in Node (HT2): the spine over src/game/hour2/glass-line-plan.js with
// every word from src/game/text/quests/glass-line.json, driven only by its events, start to end, 10 times; the order
// holds (no stage completes on another's event or out of turn); a flight with the Sonde moored is Flagged 10 of 10; the
// reward is the Survey Kite and nothing else; the stage ids are leg 4's beats of the hour-two run, in its order.
//   node --test tools/gates/kite/glass-line.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QuestSpine } from '../../../src/game/quest/spine.js';
import { makeQuestStrings } from '../../../src/game/strings.js';
import { loadText } from '../systems/lib.mjs';
import { GLASS_LINE_ID, GLASS_LINE_STAGES, GLASS_LINE_REWARD, flightFlagged, landingEvent, anchorsOf, CANE_N, CORD_N } from '../../../src/game/hour2/glass-line-plan.js';
import { beatsOfLeg } from '../../../src/game/hour2/plan.js';
import { TEST_FLIGHT } from '../../../src/game/kite/roads.js';

const quest = JSON.parse(readFileSync(new URL('../../../src/game/text/quests/glass-line.json', import.meta.url), 'utf8'));
const S = makeQuestStrings(loadText(), quest, {});
const spineOf = (hooks = {}) => new QuestSpine({ strings: S, hooks, id: GLASS_LINE_ID, stages: GLASS_LINE_STAGES, reward: GLASS_LINE_REWARD, triangles: {}, closingCard: null });
const A = anchorsOf(TEST_FLIGHT.field);
/** a world probe that says she is at `at` (an anchor id) */
const worldAt = (at) => ({ near: (anchor, r) => anchor === at, aim: () => false, bearing: () => 0 });
/** the events of a whole run, in order (what the live quest and the flight send) */
function play(spine) {
  const step = (ev, e, at = null) => { if (ev) spine.notify(ev, e); spine.update(0.1, worldAt(at)); };
  step(null, null, 'guild-stud');                                       // walk-the-line: on the stud
  spine.talk('ansel'); step('scene-done', { scene: 'kite', exit: true }); // ansel-kite
  step('gathered', { source: 'wreck', item: 'sailcloth' });               // wreck
  for (let i = 0; i < 2; i++) step('gathered', { source: 'cane-cord', n: (CANE_N + CORD_N) / 2 });   // cane-cord
  step('kite-rebuilt', {});                                               // rebuild
  step('sonde-cut', { sonde: 'ring' });                                   // tether
  step('kite:open', { from: 'T1' });                                      // launch
  step('kite:land', landingEvent({ field: true, vs: 1.0, damage: 0 }));  // fly
  spine.talk('ansel'); step('scene-done', { scene: 'kite-back', exit: true });   // kite-given
}

test('every stage has its words, and the stages are leg 4\'s beats of the hour-two run in order', () => {
  for (const s of GLASS_LINE_STAGES) assert.ok(S.stage(s.id), `no words for ${s.id}`);
  for (const s of GLASS_LINE_STAGES) for (const k of ['start', 'done']) if (s.turns?.[k]) assert.ok(S.turn(s.turns[k]), `no turn ${s.turns[k]}`);
  const beats = beatsOfLeg(4).filter((b) => b.quest === GLASS_LINE_ID).map((b) => b.id);
  assert.deepEqual(GLASS_LINE_STAGES.map((s) => s.id), beats);
  for (const s of GLASS_LINE_STAGES) if (s.anchor) assert.ok(A[s.anchor], `no anchor ${s.anchor}`);
});

test('HT2: played by its events from start to end, 10 of 10; the reward is the Survey Kite and nothing else', () => {
  for (let k = 0; k < 10; k++) {
    let reward = null;
    const sp = spineOf({ reward: (r) => { reward = r; } });
    sp.start(); play(sp);
    assert.equal(sp.done, true, `run ${k}: stopped at ${sp.current()?.id}`);
    assert.deepEqual(sp.report().reached, GLASS_LINE_STAGES.map((s) => s.id));
    assert.deepEqual(reward.items, [['survey-kite', 1]]);
    assert.equal(reward.items.length, 1);
  }
});

test('HT2: stages advance only on their own events, in order (an early flight, a landing off the field or too fast, the wrong scene)', () => {
  const sp = spineOf(); sp.start();
  sp.update(0.1, worldAt('guild-stud'));
  // the kite opened and landed before Ansel's scene: nothing moves
  for (const [ev, e] of [['kite:open', { from: 'T1' }], ['kite:land', landingEvent({ field: true, vs: 1 })], ['sonde-cut', { sonde: 'ring' }], ['kite-rebuilt', {}], ['scene-done', { scene: 'kite-back' }]]) sp.notify(ev, e);
  assert.equal(sp.current().id, 'ansel-kite');
  sp.talk('ansel'); sp.notify('scene-done', { scene: 'kite', exit: true });
  sp.notify('gathered', { source: 'wreck', item: 'cord' }); assert.equal(sp.current().id, 'wreck');
  sp.notify('gathered', { source: 'wreck', item: 'sailcloth' }); sp.notify('gathered', { source: 'cane-cord', n: 11 });
  assert.equal(sp.current().id, 'cane-cord');
  sp.notify('gathered', { source: 'cane-cord', n: 1 }); sp.notify('kite-rebuilt', {}); sp.notify('sonde-cut', { sonde: 'ring' });
  sp.notify('kite:open', { from: 'T2' }); assert.equal(sp.current().id, 'launch', 'an open off another pillar is not the launch');
  sp.notify('kite:open', { from: 'T1' });
  sp.notify('kite:land', landingEvent({ field: false, vs: 1 })); assert.equal(sp.current().id, 'fly', 'off the field');
  sp.notify('kite:land', landingEvent({ field: true, vs: 4.2, damage: 7 })); assert.equal(sp.current().id, 'fly', 'too fast');
  sp.notify('kite:land', landingEvent({ field: true, vs: 1.0, damage: 0 })); assert.equal(sp.current().id, 'kite-given');
});

test('HT2: a flight with the Sonde moored is Flagged, 10 of 10; with the tether cut it is not', () => {
  for (let k = 0; k < 10; k++) {
    const sp = spineOf(); sp.start();
    sp.update(0.1, worldAt('guild-stud')); sp.talk('ansel'); sp.notify('scene-done', { scene: 'kite', exit: true });
    sp.notify('gathered', { source: 'wreck', item: 'sailcloth' }); sp.notify('gathered', { source: 'cane-cord', n: 12 }); sp.notify('kite-rebuilt', {});
    assert.equal(flightFlagged(sp), true, `run ${k}: moored, not Flagged`);
    assert.equal(flightFlagged(sp, true), true);
    sp.notify('sonde-cut', { sonde: 'ring' });
    assert.equal(flightFlagged(sp), false);
  }
});

test('save: the spine round-trips mid-quest (serialize / restore) and goes on to its end', () => {
  const sp = spineOf(); sp.start();
  sp.update(0.1, worldAt('guild-stud')); sp.talk('ansel'); sp.notify('scene-done', { scene: 'kite', exit: true });
  const rec = JSON.parse(JSON.stringify(sp.serialize()));
  const b = spineOf(); b.restore(rec);
  assert.equal(b.current().id, 'wreck');
  b.notify('gathered', { source: 'wreck', item: 'sailcloth' }); b.notify('gathered', { source: 'cane-cord', n: 12 }); b.notify('kite-rebuilt', {});
  b.notify('sonde-cut', { sonde: 'ring' }); b.notify('kite:open', { from: 'T1' }); b.notify('kite:land', landingEvent({ field: true, vs: 1 }));
  b.talk('ansel'); b.notify('scene-done', { scene: 'kite-back', exit: true });
  assert.equal(b.done, true);
});
