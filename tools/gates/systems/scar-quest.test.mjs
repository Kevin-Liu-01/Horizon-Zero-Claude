// HR2 in Node (Milestone 2 area E, wave 3): "The Scar" and "True Ground" walk stage by stage on the events the runtime
// sends (src/game/hour.js), every string from src/game/text/ (W2). Stages advance only on their own events; Oro's
// hand-over is exactly gaff, Windwall, Brine x2, Cinder x1; the Screed stalled once; both seals off; the fail-soft branch
// (a scripted third-wall cut) is reached and the quest goes on to its end. Browser-free:
//   node --test tools/gates/systems/scar-quest.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QuestSpine } from '../../../src/game/quest/spine.js';
import {
  SCAR_ID, TRUE_GROUND_ID, SCAR_STAGES, TRUE_GROUND_STAGES, SCAR_REWARD, TRUE_GROUND_REWARD, FAIL_SOFT, ORO_KIT, NEW_BEATS, EVENTS,
} from '../../../src/game/quest/scar-plan.js';
import { questStrings } from './lib.mjs';

function rig(id) {
  const out = { notes: [], cards: [], turns: [], scenes: [], logs: [], checkpoints: [], spawns: [], reward: null, done: 0 };
  const hooks = {
    note: (t) => out.notes.push(t),
    card: (cid) => out.cards.push(cid),
    turn: (on, c, v) => out.turns.push([on, c, v]),
    scene: (sid) => out.scenes.push(sid),
    log: (sid, line) => out.logs.push([sid, line]),
    checkpoint: (r) => out.checkpoints.push(r),
    spawn: (w) => out.spawns.push(w),
    reward: (r, words) => { out.reward = [r, words]; },
    done: () => { out.done++; },
  };
  const scar = id === SCAR_ID;
  const spine = new QuestSpine({
    strings: questStrings(id), hooks, id, stages: scar ? SCAR_STAGES : TRUE_GROUND_STAGES,
    reward: scar ? SCAR_REWARD : TRUE_GROUND_REWARD, triangles: {}, closingCard: null, failSoft: scar ? FAIL_SOFT : null,
  });
  return { out, spine };
}

const world = { at: null };
const probe = { near: (a) => world.at === a, aim: () => false, bearing: () => 0 };
const step = (spine, ev, e = {}, dt = 0.1) => { if (ev) spine.notify(ev, e); spine.update(dt, probe); };

const SCAR_RUN = [
  ['region-enter', { region: 'holds' }],
  ['herd-lee', { inShadow: true }],
  ['plumb-topple', { kind: 'plumb' }],
  ['ammo-crafted', { ammo: 'hardpoint', n: 6 }],
  ['talk', 'oro'], ['scene-done', { scene: 'hand-over', exit: true }],
  ['screed-stalled', { wall: 'wall-2' }],
  ['seal-off', { seal: 'sealL' }],
  ['seal-off', { seal: 'sealR' }],
];

function walk(spine, run) {
  for (const [ev, e] of run) {
    if (ev === 'talk') { spine.talk(e); step(spine); continue; }
    step(spine, ev, e);
  }
}

test('the fourteen new beats are the two quests\' stages, in order, and every event they wait on is a scar-plan event', () => {
  assert.deepEqual(NEW_BEATS, [...SCAR_STAGES, ...TRUE_GROUND_STAGES].map((s) => s.id));
  for (const s of [...SCAR_STAGES, ...TRUE_GROUND_STAGES]) if (s.type === 'event') assert.ok(EVENTS.includes(s.event), `${s.id}: ${s.event}`);
  assert.ok(EVENTS.includes(FAIL_SOFT.event));
});

test('Oro\'s hand-over is exactly the gaff, the Windwall, two Brine Pots and one Cinder Pot', () => {
  const oro = SCAR_STAGES.find((s) => s.id === 'oro');
  assert.deepEqual(oro.gives, [['gaff', 1], ['windwall', 1], ['brine-pot', 2], ['cinder-pot', 1]]);
  assert.equal(oro.gives, ORO_KIT);
});

test('"The Scar" walks from the walk to the second seal on its own events, and pays salt x60 and the counter', () => {
  const { out, spine } = rig(SCAR_ID);
  spine.start();
  walk(spine, SCAR_RUN);
  assert.equal(spine.done, true, `stopped at ${spine.current()?.id}`);
  assert.deepEqual(spine.report().reached, SCAR_STAGES.map((s) => s.id));
  assert.equal(spine.report().branch, null);
  assert.deepEqual(out.reward[0], SCAR_REWARD);
  assert.deepEqual(out.reward[1], ['SALT ×60', "ORO'S KIT · YOURS TO KEEP"]);
  assert.equal(out.done, 1);
  assert.ok(out.scenes.includes('hand-over') && out.scenes.includes('stood-down'));
  assert.deepEqual(out.spawns, ['herd', 'oro', 'screed']);
  // every stage is a silent checkpoint (BIBLE 17), 'seal-2' among them: the save leg 3 starts from
  assert.ok(out.checkpoints.includes('stage:seal-2'));
  assert.equal(out.logs.at(-1)[1], 'The Screed stood down. The line is still on four walls.');
});

test('a stage advances only on its own event: out-of-order events do nothing', () => {
  const { spine } = rig(SCAR_ID);
  spine.start();
  // before the walk: a seal, a stall, a topple, a herd-lee and the wrong region do nothing
  for (const [ev, e] of [['seal-off', { seal: 'sealL' }], ['screed-stalled', {}], ['plumb-topple', { kind: 'plumb' }], ['herd-lee', { inShadow: true }], ['region-enter', { region: 'malpais' }]]) step(spine, ev, e);
  assert.equal(spine.current().id, 'walk');
  step(spine, 'region-enter', { region: 'holds' });
  assert.equal(spine.current().id, 'herd');
  step(spine, 'herd-lee', { inShadow: false });
  assert.equal(spine.current().id, 'herd', 'out of the shadow does not count');
  step(spine, 'herd-lee', { inShadow: true });
  step(spine, 'plumb-topple', { kind: 'tiller' });
  assert.equal(spine.current().id, 'plumb-2', 'a Tiller is not the Plumb');
  step(spine, 'plumb-topple', { kind: 'plumb' });
  step(spine, 'ammo-crafted', { ammo: 'hunter', n: 6 });
  assert.equal(spine.current().id, 'barbed', 'Reed arrows are not Barbed');
  step(spine, 'ammo-crafted', { ammo: 'hardpoint', n: 6 });
  assert.equal(spine.talk('ansel'), null);
  spine.talk('oro');
  step(spine, 'scene-done', { scene: 'hand-over', exit: false });
  assert.equal(spine.current().id, 'oro', 'the hand-over left before its end does not count');
  step(spine, 'scene-done', { scene: 'hand-over', exit: true });
  step(spine, 'seal-off', { seal: 'sealL' });
  assert.equal(spine.current().id, 'stall', 'a seal before the stall does nothing');
  step(spine, 'screed-stalled', {});
  step(spine, 'screed-stalled', {});
  assert.equal(spine.current().id, 'seal-1', 'stalled once is the stage; a second stall is not a seal');
});

test('the fail-soft branch: the third wall cut while the fight runs goes on to the second seal, and the quest ends', () => {
  const { out, spine } = rig(SCAR_ID);
  spine.start();
  walk(spine, SCAR_RUN.slice(0, 6));
  assert.equal(spine.current().id, 'stall');
  // a cut of another wall is not the branch
  step(spine, 'wall-cut', { wall: 2 });
  assert.equal(spine.current().id, 'stall');
  step(spine, 'wall-cut', { wall: 3, id: 'wall-3' });
  assert.equal(spine.current().id, 'seal-2');
  assert.equal(spine.report().branch, 'wall-cut');
  assert.equal(spine.st.stall.state, 'cut');
  assert.equal(spine.st['seal-1'].state, 'cut');
  assert.ok(out.logs.some(([id, l]) => id === 'stall' && l === 'The Screed cut the third wall down to the line.'));
  assert.ok(out.turns.some(([on]) => on === 'wall-cut'));
  step(spine, 'seal-off', { seal: 'sealR' });
  assert.equal(spine.done, true);
  assert.equal(out.logs.at(-1)[1], 'The third wall is cut to the line. Ninewalls is poorer, and standing.');
  // the branch is taken once: a later cut does nothing
  step(spine, 'wall-cut', { wall: 3 });
  assert.equal(out.done, 1);
});

test('a "The Scar" record mid-fight round-trips (serialize / restore), its branch and its stages', () => {
  const a = rig(SCAR_ID);
  a.spine.start();
  walk(a.spine, SCAR_RUN.slice(0, 6));
  step(a.spine, 'wall-cut', { wall: 3 });
  const rec = JSON.parse(JSON.stringify(a.spine.serialize()));
  const b = rig(SCAR_ID);
  assert.equal(b.spine.restore(rec), true);
  assert.equal(b.spine.current().id, 'seal-2');
  assert.equal(b.spine.report().branch, 'wall-cut');
  assert.equal(b.out.turns.length + b.out.scenes.length + b.out.cards.length, 0, 'restore replays nothing');
  // a record of the other quest is refused
  const c = rig(TRUE_GROUND_ID);
  assert.equal(c.spine.restore(rec), false);
});

test('"True Ground": the walk to B1, the re-survey with its bearings, the fade; the rest, calima and the Transit wait (wave 4)', () => {
  const { out, spine } = rig(TRUE_GROUND_ID);
  spine.start();
  step(spine, 'resurvey-done', { benchmark: 'bm-01', bearings: [249, 77, 264] });
  assert.equal(spine.current().id, 'scar', 'the re-survey does not count before she is at B1');
  world.at = 'b1'; step(spine); world.at = null;
  assert.equal(spine.current().id, 'survey');
  assert.deepEqual(out.spawns, ['lookers']);
  assert.ok(out.cards.includes('resurvey'));
  for (const n of [1, 2]) step(spine, 'bearing-taken', { benchmark: 'bm-01', n });
  assert.match(spine.noteText(), /2 \/ 3$/);
  step(spine, 'resurvey-done', { benchmark: 'bm-04', bearings: [] });
  assert.equal(spine.current().id, 'survey', 'another benchmark does not count');
  step(spine, 'resurvey-done', { benchmark: 'bm-01', bearings: [249.3, 76.6, 264] });
  assert.equal(spine.current().id, 'fade');
  step(spine, 'line-faded', { walls: 0 });
  assert.equal(spine.current().id, 'rest-noon');
  step(spine, 'rested', { brazier: 'ninewalls', hour: 12 });
  step(spine, 'region-enter', { region: 'malpais' });
  step(spine, 'sighted', { card: 'TRANSIT · BASELINE · STATION 1 OF 9' });
  assert.equal(spine.done, true);
  assert.deepEqual(out.reward[0], TRUE_GROUND_REWARD);
  assert.deepEqual(out.reward[1], ['WALK THE LINE TO BENCHMARK 1']);
});

test('every stage, scene and turn the two quests name has its words in src/game/text (no placeholder left unfilled)', () => {
  for (const [id, stages] of [[SCAR_ID, SCAR_STAGES], [TRUE_GROUND_ID, TRUE_GROUND_STAGES]]) {
    const S = questStrings(id);
    for (const s of stages) {
      assert.ok(S.stage(s.id)?.note && S.stage(s.id)?.log, `${id}/${s.id}`);
      for (const k of ['start', 'done']) {
        if (s.turns?.[k]) assert.ok(S.turn(s.turns[k]), `${id}/${s.id} turn ${s.turns[k]}`);
        if (s.scenes?.[k]) assert.ok(S.scene(s.scenes[k]), `${id}/${s.id} scene ${s.scenes[k]}`);
      }
      for (const tm of (s.timed || [])) assert.ok(S.turn(tm.turn) && !/\{bearing\}/.test(S.turn(tm.turn).lines.join(' ')), `${id} timed ${tm.turn}`);
      for (const c of (s.cards || [])) assert.ok(S.card(c), `${id} card ${c}`);
      if (s.type === 'talk') assert.ok(S.scene(s.scene), `${id} scene ${s.scene}`);
      if (s.sighting) assert.ok(S.sighting(s.sighting), `${id} sighting ${s.sighting}`);
    }
    assert.ok(S.quest.closing.note && S.quest.closing.reward.length);
  }
  assert.ok(questStrings(SCAR_ID).turn(FAIL_SOFT.turn));
  const T = questStrings(TRUE_GROUND_ID);
  for (const on of ['resurvey-start', 'lookers', 'arc-paused', 'off-mark', 'bearing-T1', 'bearing-T2', 'bearing-sounding-ring']) assert.ok(T.turn(on), on);
  assert.equal(T.sighting('transit').line, 'TRANSIT · BASELINE · STATION 1 OF 9');
});
