// M1.6a: "Raker's Morning" walks from 0:00 to the reward on the events the runtime sends, and every string it
// shows comes from src/game/text/. Browser-free: node --test tools/gates/systems/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { QuestSpine } from '../../../src/game/quest/spine.js';
import { STAGES } from '../../../src/game/quest/plan.js';
import { strings, loadText, ROOT } from './lib.mjs';

function rig() {
  const out = { notes: [], cards: [], turns: [], scenes: [], logs: [], checkpoints: [], spawns: [], reward: null, triangles: [] };
  const hooks = {
    note: (t) => out.notes.push(t),
    card: (id, c) => out.cards.push([id, c]),
    turn: (on, c, v) => out.turns.push([on, c, v]),
    scene: (id, s) => out.scenes.push([id, s]),
    log: (id, line) => out.logs.push([id, line]),
    checkpoint: (r) => out.checkpoints.push(r),
    spawn: (w) => out.spawns.push(w),
    reward: (r, words) => { out.reward = [r, words]; },
    triangle: (id) => out.triangles.push(id),
  };
  return { out, spine: new QuestSpine({ strings: strings(), hooks }) };
}

/** A fake world: `at` is the anchor Brea stands at; `aiming` the target in the hairs. */
function world() {
  const w = { at: null, up: 0, aiming: null };
  w.probe = {
    near: (a, r, up = 0) => w.at === a && w.up >= up,
    aim: (t) => w.aiming === t,
    bearing: (t) => ({ T2: 77, T6: 21 })[t] ?? 0,
  };
  return w;
}

function walk(spine, w, steps) {
  for (const s of steps) {
    if (s.at !== undefined) { w.at = s.at; w.up = s.up ?? 0; }
    if (s.aim !== undefined) w.aiming = s.aim;
    if (s.ev) spine.notify(s.ev, s.e || {});
    if (s.talk) spine.talk(s.talk);
    spine.update(s.dt ?? 0.1, w.probe);
  }
}

const RUN = [
  { at: 'pans' },
  ...Array.from({ length: 10 }, () => ({ ev: 'gathered', e: { source: 'rake', n: 1 } })),
  { at: 'gauge', aim: 'gauge', dt: 0.5 }, { dt: 0.5 },
  { aim: null, talk: 'ansel' }, { ev: 'scene-done', e: { scene: 'tell', exit: true } },
  ...Array.from({ length: 6 }, () => ({ ev: 'gathered', e: { source: 'cane', n: 1 } })),
  { ev: 'ammo-crafted', e: { ammo: 'hunter', n: 10 } },
  { talk: 'mise' }, { ev: 'scene-done', e: { scene: 'mise', exit: true } },
  { ev: 'machine-killed', e: { kind: 'peg' } }, { ev: 'machine-killed', e: { kind: 'peg' } },
  { at: 'crossed' },
  { at: 't1', up: 3 },
  { aim: 'T2', dt: 0.6 }, { dt: 0.6 }, { aim: 'T6', dt: 0.6 }, { dt: 0.6 },
  { at: 'ditch', aim: null, up: 0 },
  { ev: 'plumb-hit' }, { ev: 'plumb-topple', e: { kind: 'plumb' } },
  { ev: 'part-torn', e: { kind: 'plumb', part: 'bob' } },
  { talk: 'ansel' }, { ev: 'scene-done', e: { scene: 'return', exit: true } },
];

test('the spine walks every beat of Raker\'s Morning in order to the reward', () => {
  const { out, spine } = rig();
  spine.start();
  const w = world();
  walk(spine, w, RUN);
  const rep = spine.report();
  assert.equal(rep.done, true, `stopped at ${rep.current}`);
  const want = STAGES.filter((s) => !s.optional).map((s) => s.id);
  assert.deepEqual(rep.reached, want);
  assert.equal(rep.stages.lamps, 'done');
  assert.equal(rep.lamps, 2);
  assert.deepEqual(rep.triangles, ['T1-T2-T6']);
  assert.deepEqual(out.reward[0].items, [['metal-shards', 30]]);
  assert.equal(out.reward[0].rung, 'scout');
  assert.deepEqual(out.spawns, ['transect', 'plumb']);
  // a silent checkpoint for every completed stage, and one for the quest
  assert.equal(out.checkpoints.length, want.length + 1);
  // the objective types the bible names are all exercised
  assert.deepEqual([...new Set(STAGES.map((s) => s.type))].sort(), ['gather', 'goto', 'kill', 'sight', 'survey', 'talk']);
});

test('an out-of-order event does not advance a beat (no script jumps)', () => {
  const { spine } = rig();
  spine.start();
  const w = world();
  walk(spine, w, [{ ev: 'plumb-topple', e: { kind: 'plumb' } }, { ev: 'scene-done', e: { scene: 'return' } }, { at: 't1', up: 3 }]);
  assert.equal(spine.report().current, 'wake');
  assert.deepEqual(spine.report().reached, []);
});

test('the crossing log reads the Flagged line when she was Flagged, and the Flag turn shows once', () => {
  const { out, spine } = rig();
  spine.start();
  const w = world();
  const upToCross = RUN.slice(0, RUN.findIndex((s) => s.at === 'crossed'));
  walk(spine, w, upToCross);
  walk(spine, w, [{ ev: 'flagged' }, { ev: 'flagged' }, { at: 'crossed' }]);
  const T = loadText().quest.stages.find((s) => s.id === 'cross');
  assert.ok(out.logs.some(([id, l]) => id === 'cross' && l === T.logFlagged));
  assert.equal(out.turns.filter(([on]) => on === 'flagged').length, 1);
  assert.ok(!out.turns.some(([on]) => on === 'crossed-unseen'));
});

test('serialize and restore hold the stage, counts and what was seen; nothing replays', () => {
  const { spine } = rig();
  spine.start();
  const w = world();
  walk(spine, w, RUN.slice(0, 6));
  const blob = JSON.parse(JSON.stringify(spine.serialize()));
  const b = rig();
  b.spine.restore(blob);
  assert.deepEqual(b.spine.serialize(), blob);
  assert.equal(b.out.cards.length + b.out.turns.length + b.out.scenes.length, 0);
  walk(b.spine, w, RUN.slice(6));
  assert.equal(b.spine.report().done, true);
});

test('every string the spine shows is a string from src/game/text/', () => {
  const { out, spine } = rig();
  spine.start();
  walk(spine, world(), RUN);
  const T = loadText();
  const all = new Set();
  const walkJson = (v) => {
    if (typeof v === 'string') all.add(v);
    else if (Array.isArray(v)) v.forEach(walkJson);
    else if (v && typeof v === 'object') Object.values(v).forEach(walkJson);
  };
  walkJson(T);
  // notes are filled templates: strip the filled counts back to the template form
  for (const n of out.notes) {
    const tmpl = n.replace(/\d+ \/ \d+$/, '{n} / {of}');
    assert.ok(all.has(n) || all.has(tmpl), `note not in text: ${n}`);
  }
  for (const [, line] of out.logs) {
    assert.ok(all.has(line) || [...all].some((s) => s.includes('{n}') && line === s.replace('{n}', '2')), `log not in text: ${line}`);
  }
  for (const [, c] of out.cards) assert.ok(all.has(c.body));
  for (const [, c] of out.turns) for (const l of c.lines) assert.ok(all.has(l));
  for (const [, s] of out.scenes) for (const c of s.cards) for (const l of c.lines) assert.ok(all.has(l));
  for (const w of out.reward[1]) assert.ok(all.has(w));
});

test('the game code under src/game holds no player-facing English outside src/game/text', () => {
  // a coarse lint: a quoted string of three or more words with a lowercase letter is prose
  const files = [];
  const scan = (d) => {
    for (const e of readdirSync(`${ROOT}${d}`, { withFileTypes: true })) {
      if (e.isDirectory()) { if (e.name !== 'text') scan(`${d}/${e.name}`); }
      else if (e.name.endsWith('.js')) files.push(`${d}/${e.name}`);
    }
  };
  scan('src/game');
  const bad = [];
  for (const f of files) {
    const src = readFileSync(`${ROOT}${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const m of src.matchAll(/(['"`])((?:(?!\1).){0,200})\1/g)) {
      const s = m[2];
      if (/^[A-Za-z][a-z]+( [a-z']+){2,}[.!?]?$/.test(s) && !/^(not a|unknown|no )/.test(s)) bad.push(`${f}: ${s}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('a crossing under SPOTTED is not "nobody the wiser": seen marks the stage, its log says so (systems-1b fix)', () => {
  const upTo = RUN.findIndex((s) => s.at === 'crossed');
  for (const seen of [false, true]) {
    const { out, spine } = rig();
    const w = world();
    spine.start();
    walk(spine, w, RUN.slice(0, upTo));
    if (seen) spine.notify('seen');
    walk(spine, w, [RUN[upTo]]);
    const log = out.logs.find(([id]) => id === 'cross')?.[1];
    const unseen = out.turns.some(([on]) => on === 'crossed-unseen');
    assert.equal(unseen, !seen);
    assert.equal(log, seen ? 'Crossed the transect. Seen by a Peg.' : 'Crossed the transect unseen.');
    assert.equal(spine.report().seenCrossing, seen);
    // a save keeps it
    const back = rig().spine;
    back.restore(JSON.parse(JSON.stringify(spine.serialize())));
    assert.equal(back.st.cross.seen, seen);
  }
});
