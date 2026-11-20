// "The Kiln Yards" in Node (Milestone 3 wave 3, area E; the quest half of BUILD M3.3, the brief's HT3, Q4's default and
// R7): Oro gives it only after "True Ground"; its stages advance only on their own events; a wellhead is quenched by Brine
// within 3 m while a Kiln is plugged into it or after, and by nothing else; four quenched ends the quest's Yards and the
// region's Kiln spawns (0 over 24 site-clock hours); never two Kilns awake; the reward is rung 7, held at Oro's while
// rung 6 is not owned. The encounter runs area C's KilnBrain and SpindleEscort over area A's wellheads seam.
// Browser-free: node --test src/game/hour2/kiln-yards.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as seam from '../../world/sites/kilnyards-layout.js';
import { QuestSpine } from '../quest/spine.js';
import { makeStrings } from '../strings.js';
import { KILN_RULES } from '../../instruments/kinds/kiln/rules.js';
import {
  KILN_YARDS_ID, KILN_YARDS_STAGES, KILN_YARDS_REWARD, YARDS_RULES, YardsEncounter, quenchAt, spawnsOver, offered, rewardVerdict, inEye, WELL_IDS, catchUp,
} from './kiln-yards-plan.js';
import { BEATS } from './plan.js';

const DIR = fileURLToPath(new URL('../text/', import.meta.url));
const load = (rel) => JSON.parse(readFileSync(DIR + rel, 'utf8'));
const index = load('index.json');
const strings = () => makeStrings({
  index, quest: load('quests/kiln-yards.json'), tutorial: load(index.files.tutorial), sighting: load(index.files.sighting), barks: load(index.files.barks),
  systems: load('ui/systems.json'), extraCards: [...load(index.w2.files.tutorial).cards, ...load(index.w3.files.tutorial).cards], extraSighting: [],
});
function rig() {
  const out = { turns: [], cards: [], scenes: [], reward: null, checkpoints: [], spawns: [] };
  const spine = new QuestSpine({
    strings: strings(), id: KILN_YARDS_ID, stages: KILN_YARDS_STAGES, reward: KILN_YARDS_REWARD, triangles: {}, closingCard: null,
    hooks: { turn: (on) => out.turns.push(on), card: (id) => out.cards.push(id), scene: (id) => out.scenes.push(id), reward: (r, w) => { out.reward = [r, w]; },
      checkpoint: (r) => out.checkpoints.push(r), spawn: (w) => out.spawns.push(w) },
  });
  return { spine, out };
}
const probe = { near: () => false, aim: () => false, bearing: () => 0 };
const fresh = () => { seam.resetWellheads(); return new YardsEncounter(seam, { ever: new Set() }).standUp(); };
const well = (id) => seam.WELLHEADS.find((w) => w.id === id);
/** Step the encounter `s` seconds of sim time at 10 Hz with Brea at `at`; every event and the most awake at any step. */
function run(Y, s, at, sink = []) { let most = 0; for (let t = 0; t < s; t += 0.1) { sink.push(...Y.step(0.1, at)); most = Math.max(most, Y.awake()); } return most; }
/** Brea's stand south of a wellhead (downhill of the bench, out of the shelf's eye): 5 m off it, across the apron. */
const southOf = (w) => ({ x: w.x + 0.0873 * 5, z: w.z + 0.9962 * 5 });   // the apron's v axis is bearing 355; -v is engine +z
const plugged = () => seam.wellheads().filter((w) => w.plugged).map((w) => w.id);

beforeEach(() => seam.resetWellheads());

test('the stages are leg 6\'s eleven beats, in order, each waiting on the beat\'s own event', () => {
  const leg6 = BEATS.filter((b) => b.leg === 6);
  assert.deepEqual(KILN_YARDS_STAGES.map((s) => s.id), leg6.map((b) => b.id));
  for (const s of KILN_YARDS_STAGES) {
    const b = leg6.find((x) => x.id === s.id);
    if (s.type === 'event') assert.equal(s.event, b.event, s.id);
    if (s.type === 'talk') assert.equal(b.event, b.id === 'oro-yards' ? 'scene-done' : 'quest-rewarded', s.id);
    if (s.type === 'rest') assert.equal(b.event, 'rested', s.id);
  }
});

test('HT3: Oro gives it only after "True Ground" (the offer reads True Ground\'s spine)', () => {
  assert.equal(offered(null), false);
  assert.equal(offered({ done: false, started: true }), false);
  assert.equal(offered({ done: true }), true);
});

test('stages advance only on their own events (a seen reach, a wrong count, a kill and a Flag move nothing)', () => {
  const { spine, out } = rig();
  spine.start();
  assert.equal(spine.current().id, 'oro-yards');
  assert.equal(spine.talk('oro'), 'yards');
  spine.notify('scene-done', { scene: 'yards', exit: true });
  assert.equal(spine.current().id, 'climb');
  assert.deepEqual(out.spawns, ['yards']);
  spine.notify('region-enter', { region: 'holds' });
  assert.equal(spine.current().id, 'climb');
  spine.notify('region-enter', { region: 'malpais' });
  assert.equal(spine.current().id, 'plugged');
  for (const [ev, e] of [['wellhead-reached', { unseen: false, plugged: true }], ['wellhead-reached', { unseen: true, plugged: false }], ['machine-killed', { kind: 'kiln' }], ['flagged', {}], ['wellhead-quenched', { n: 1 }]]) {
    spine.notify(ev, e); spine.update(0.1, probe);
    assert.equal(spine.current().id, 'plugged', `${ev} ${JSON.stringify(e)}`);
  }
  spine.notify('wellhead-reached', { unseen: true, plugged: true, id: 'wh-1' });
  assert.equal(spine.current().id, 'quench-1');
  spine.notify('wellhead-quenched', { n: 2 });
  assert.equal(spine.current().id, 'quench-1');
  for (const n of [1, 2, 3, 4]) { spine.notify('wellhead-quenched', { n }); assert.equal(spine.current().id, n < 4 ? `quench-${n + 1}` : 'yards-quiet'); }
  spine.notify('yards-quiet', {});
  assert.equal(spine.current().id, 'tube-rest');
  spine.notify('rested', { brazier: 'ninewalls' });
  assert.equal(spine.current().id, 'tube-rest');
  spine.notify('rested', { brazier: 'tube-shelter', hour: 15 });
  spine.notify('kite:land', { near: 'scar-foot' });
  assert.equal(spine.current().id, 'rung-7-held');
  assert.equal(spine.talk('oro'), 'yards-paid');
  spine.notify('scene-done', { scene: 'yards-paid', exit: true });
  assert.equal(spine.done, true);
  assert.deepEqual(spine.report().reached, KILN_YARDS_STAGES.map((s) => s.id));
  assert.equal(out.reward[0].held, 'rung-7');
  assert.equal(out.reward[1][0], 'RUNG 7 · ARCANE · HELD AT ORO\'S');
  assert.ok(out.cards.includes('yards'));
  for (const n of [1, 2, 3, 4]) assert.ok(out.turns.includes(`quenched-${n}`));
});

test('HT3: Brine quenches a hot wellhead within 3 m while a Kiln is plugged into it or after, and nothing else does', () => {
  const W = () => seam.wellheads();
  const w1 = well('wh-1');
  // a Kiln plugged into wh-1
  seam.plugIn('wh-1', 'kiln');
  assert.equal(quenchAt({ x: w1.x + 3.05, z: w1.z }, W(), new Set()).id, null, 'outside 3 m');
  assert.equal(quenchAt({ x: w1.x + 2.95, z: w1.z }, W(), new Set()).id, 'wh-1', 'inside 3 m, plugged');
  // never plugged: nothing, however near
  const w2 = well('wh-2');
  const r2 = quenchAt({ x: w2.x, z: w2.z }, W(), new Set());
  assert.equal(r2.id, null); assert.match(r2.why, /no Kiln has plugged/);
  // plugged once, then left: "or after"
  assert.equal(quenchAt({ x: w2.x, z: w2.z }, W(), new Set(['wh-2'])).id, 'wh-2');
  // already quenched: nothing
  seam.setQuenched('wh-1');
  assert.match(quenchAt({ x: w1.x, z: w1.z }, W(), new Set(['wh-1'])).why, /already quenched/);
  assert.equal(YARDS_RULES.quenchR, 3);
});

test('Q4 and R7: two Kilns, one plugged and still, one awake with the Spindle; never two awake through all four quenches', () => {
  const Y = fresh();
  assert.equal(Y.kilns.length, 2);
  const ev = [];
  let most = run(Y, KILN_RULES.coupleS + 1, null, ev);
  assert.deepEqual(plugged(), ['wh-1'], 'the first Kiln is plugged into wh-1');
  assert.equal(Y.awake(), 1);
  assert.ok(Y.spindle);
  const quenchedWhilePlugged = [];
  for (let k = 0; k < 4; k++) {
    // wait for a Kiln to be plugged in (the awake one walks to the nearest hot wellhead after each quench)
    let waited = 0;
    while (!plugged().length && waited < 120) { most = Math.max(most, run(Y, 0.5, null, ev)); waited += 0.5; }
    const [id] = plugged();
    assert.ok(id, `a Kiln plugged in before quench ${k + 1} (waited ${waited} s)`);
    const w = well(id);
    // Brine on a hot wellhead that no Kiln has held does nothing
    const other = seam.wellheads().find((x) => x.state === 'hot' && !x.plugged && !Y.ever.has(x.id));
    if (other) assert.equal(Y.brine({ x: other.x, z: other.z }).id, null);
    assert.equal(Y.brine({ x: w.x + 1.0, z: w.z + 1.0 }).id, id);
    quenchedWhilePlugged.push(id);
    most = Math.max(most, run(Y, 1, null, ev));
  }
  assert.equal(seam.quenchedCount(), 4);
  assert.deepEqual([...quenchedWhilePlugged].sort(), [...WELL_IDS].sort(), 'each of the four quenched while a Kiln was plugged into it');
  most = Math.max(most, run(Y, 2, null, ev));
  assert.ok(ev.some((e) => e.type === 'yards-quiet'), 'the Yards go quiet');
  assert.ok(Y.kilns.every((k) => k.role === 'cold'));
  assert.equal(most, 1, 'at most one Kiln awake at any step');
  assert.equal(Y.maxAwake, 1);
});

test('IK3 for the quest: four quenched, 0 Kilns spawn in the region over 24 site-clock hours; one hot, they come', () => {
  const W = () => seam.wellheads();
  assert.ok(spawnsOver(24, W(), 0) > 0, 'with hot wellheads and none alive, Kilns come');
  for (const id of WELL_IDS) seam.setQuenched(id);
  assert.equal(spawnsOver(24, W(), 0), 0);
  assert.equal(spawnsOver(24 * 7, W(), 0), 0, 'and not in a week');
  seam.resetWellheads();
  for (const id of WELL_IDS.slice(0, 3)) seam.setQuenched(id);
  assert.ok(spawnsOver(24, W(), 0) > 0, 'three quenched is not enough');
});

test('the reward: rung 7, held at Oro\'s while rung 6 is not owned; made once it is', () => {
  assert.deepEqual(rewardVerdict([]), { rung: 'arcane', held: true, until: 'vanguard' });
  assert.deepEqual(rewardVerdict(['starter', 'scout', 'reckoner']), { rung: 'arcane', held: true, until: 'vanguard' });
  assert.deepEqual(rewardVerdict(['vanguard']), { rung: 'arcane', held: false });
  assert.equal(KILN_YARDS_REWARD.held, 'rung-7');
});

test('seen: the awake Kiln\'s eye (24 m, 60 deg each side) and the Spindle\'s ring (10 m all round); a plugged Kiln is blind', () => {
  assert.equal(inEye(0, 0, 0, 0, 20, 24, 60), true);
  assert.equal(inEye(0, 0, 0, 0, -20, 24, 60), false, 'behind it');
  assert.equal(inEye(0, 0, 0, 20, 5, 24, 60), false, 'beside it');
  assert.equal(inEye(0, 0, 0, 0, 25, 24, 60), false, 'past its range');
  const Y = fresh();
  run(Y, KILN_RULES.coupleS + 1, null);
  // standing at the plugged Kiln's wellhead, south of the bench: the shelf's eye does not reach her there
  const w = well(plugged()[0]);
  const ev = [];
  run(Y, 1, southOf(w), ev);
  const reach = ev.find((e) => e.type === 'wellhead-reached');
  assert.ok(reach, 'she reached it');
  assert.equal(reach.plugged, true);
  // and the walking Kiln standing over her sees her
  const aw = Y.kilns.find((k) => k.role === 'awake').brain;
  const front = { x: aw.x + Math.sin(aw.heading) * 8, z: aw.z + Math.cos(aw.heading) * 8 };
  Y.step(0.05, front);
  assert.equal(Y.seen, true);
});

test('a played Yards (scripted positions, 10 plays): every stage from climb to yards-quiet on the encounter\'s own events', () => {
  for (let play = 0; play < 10; play++) {
    seam.resetWellheads();
    const { spine } = rig();
    spine.start(); spine.talk('oro'); spine.notify('scene-done', { scene: 'yards', exit: true });
    spine.notify('region-enter', { region: 'malpais' });
    const Y = new YardsEncounter(seam, { ever: new Set() }).standUp();
    let t = 0;
    // the live quest's feed (./kiln-yards.js): the encounter's events, then what the world already shows (catchUp)
    const feed = (evs) => {
      for (const e of evs) { if (e.type === 'wellhead-reached') spine.notify('wellhead-reached', e); if (e.type === 'yards-quiet') spine.notify('yards-quiet', e); }
      const c = catchUp(spine.current()?.id, seam, Y); if (c) spine.notify(...c);
    };
    // wait a little each play (the awake Kiln is somewhere else on its walk each time)
    for (let s = 0; s < 3 + play * 4; s += 0.1) feed(Y.step(0.1, null));
    while (seam.quenchedCount() < 4 && t < 600) {
      const id = plugged()[0];
      const at = id ? southOf(well(id)) : { x: 200, z: 60 };
      for (let s = 0; s < 1.5; s += 0.1) { feed(Y.step(0.1, at)); t += 0.1; }
      if (id && !Y.seen) {
        const r = Y.brine(well(id));
        if (r.id) feed(Y.step(0.1, at));
      }
    }
    for (let s = 0; s < 3; s += 0.1) feed(Y.step(0.1, null));
    assert.equal(seam.quenchedCount(), 4, `play ${play}`);
    assert.equal(spine.current()?.id, 'tube-rest', `play ${play}: ${JSON.stringify(spine.report().stages)}`);
    assert.equal(Y.maxAwake, 1);
  }
});

test('HT5: the Yards ride the save (the wellheads, the heads a Kiln has held, the spine) and stand up again from it', () => {
  const Y = fresh();
  run(Y, KILN_RULES.coupleS + 1, null);
  Y.brine(well('wh-1'));
  run(Y, 1, null);
  const { spine } = rig();
  spine.start(); spine.talk('oro'); spine.notify('scene-done', { scene: 'yards', exit: true }); spine.notify('region-enter', { region: 'malpais' });
  spine.notify('wellhead-reached', { unseen: true, plugged: true }); spine.notify('wellhead-quenched', { n: 1 });
  const rec = JSON.parse(JSON.stringify({ quest: spine.serialize(), wellheads: seam.wellheadsSave().get(), ever: [...Y.ever] }));
  seam.resetWellheads();
  seam.wellheadsSave().set(rec.wellheads);
  const back = rig().spine; back.restore(rec.quest);
  assert.equal(back.current().id, 'quench-2');
  assert.equal(seam.quenchedCount(), 1);
  const Y2 = new YardsEncounter(seam, { ever: new Set(rec.ever) }).standUp();
  run(Y2, KILN_RULES.coupleS + 1, null);
  assert.equal(plugged().length, 1);
  assert.notEqual(plugged()[0], 'wh-1', 'a quenched head is never chosen');
  assert.equal(Y2.awake(), 1);
});
