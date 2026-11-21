// M2 exit line X1: the terrace Plumb toppled at 'plumb-2' stays down while Brea is within 80 m of it or it is in her
// view, then gets up out of sight and goes home calm on a leash (src/game/terrace-down.js, wired in src/game/hour.js).
// The machine here is a stand-in with the real downed reaction (src/entities/machines/ai/reactions.js) and the topple's
// own clock (plumb.js `_poseTopple`, its TOPPLE read from the source: plumb.js does not load in Node).
// Browser-free: node --test tools/gates/systems/terrace-down.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { TerraceDown, HOLD_AT_S, HOME } from '../../../src/game/terrace-down.js';
import { NEAR_M } from '../../../src/game/sites/clock.js';
import { Reactions } from '../../../src/entities/machines/ai/reactions.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const src = (p) => readFileSync(path.join(REPO, p), 'utf8');
const TOPPLE = (() => {
  const m = src('src/instruments/kinds/plumb.js').match(/export const TOPPLE = Object\.freeze\(\{([^}]*)\}\)/);
  return Object.fromEntries(m[1].split(',').map((kv) => kv.split(':').map((s) => s.trim())).map(([k, v]) => [k, Number(v)]));
})();

// the exit run 5 chain-3 record (c9f130e): the topple stand, and where she was felled on the walk to Oro
const TERRACE = { x: -59.1, z: 128.3 };
const STAND = { x: -57.5, z: 127.7 };
const FELLED = { x: -36.8, z: 246.6 };
const DT = 1 / 60;

/** A Plumb stand-in: plumb.js's topple clock and setState, machine.js's state names, the real Reactions. */
function plumb(at = TERRACE) {
  const m = {
    kind: 'plumb', alive: true, state: 'attack', position: { ...at }, _toppleT: -1, _alertEpisode: true, _speed: 0,
    _react: { k: 0, t: 0, x: 0, z: 0 }, ctx: {}, territory: null, states: [],
    ai: { engage: { cfg: Object.freeze({ band: [9, 14], leash: 150 }) } },
    setState(n) { if (this.state === n) return; this.state = n; this.states.push(n); if (n === 'patrol' || n === 'return') this._alertEpisode = false; },
    _cancelAttack() {},
    topple() { this._toppleT = 0; this.ai.reactions._down(); this.ai.reactions.downedT = TOPPLE.downS; this.ai.reactions.cdT = TOPPLE.downS + 1; },
    frame(dt) {
      this.ai.reactions.update(dt);
      if (this._toppleT >= 0) { this._toppleT += dt; if (this._toppleT >= TOPPLE.downS) this._toppleT = -1; }
    },
  };
  m.ai.reactions = new Reactions(m);
  return m;
}

function rig({ done = true, player = STAND, view = false } = {}) {
  const w = { p: { ...player }, view, done };
  const td = new TerraceDown({ done: () => w.done, world: () => ({ player: () => w.p, inView: () => w.view }), home: TERRACE });
  return { w, td };
}
const run = (m, td, s, each = () => {}) => { for (let i = 0, n = Math.round(s / DT); i < n; i++) { m.frame(DT); td.step([m], i * DT); each(i * DT); } };

test('the hold sits inside the topple\'s lying part (plumb.js TOPPLE), where the bounce has settled', () => {
  assert.deepEqual(TOPPLE, { fallS: 0.42, downS: 4, riseS: 0.6, hits: 2, clearM: 0.02 });
  assert.ok(HOLD_AT_S > TOPPLE.fallS && HOLD_AT_S + 0.1 < TOPPLE.downS - TOPPLE.riseS, `${HOLD_AT_S} in (${TOPPLE.fallS}, ${TOPPLE.downS - TOPPLE.riseS})`);
  assert.ok(0.04 * Math.exp(-6 * (HOLD_AT_S - TOPPLE.fallS)) < 1e-6);
});

test('X1 as it was (no rule): toppled at plumb-2 it stands again 4 s later in its fight', () => {
  const m = plumb();
  m.topple();
  for (let i = 0; i < 6 / DT; i++) m.frame(DT);
  assert.equal(m._toppleT, -1);
  assert.equal(m.state, 'attack', 'it resumes its fight (reactions._resume)');
  assert.equal(m._alertEpisode, true);
});

test('before plumb-2 is done nothing is held (the topple that closes the stage runs as the kind\'s)', () => {
  const { td } = rig({ done: false });
  const m = plumb();
  m.topple();
  run(m, td, 6);
  assert.equal(m._toppleT, -1);
  assert.equal(m.state, 'attack');
  assert.equal(m._questDown, undefined);
});

test('after plumb-2: it stays down beside her (11 m), for as long as she stays (120 s)', () => {
  const { td } = rig();
  const m = plumb();
  m.topple();
  let maxT = 0;
  run(m, td, 120, () => { maxT = Math.max(maxT, m._toppleT); assert.equal(m.state, 'downed'); });
  assert.ok(maxT <= HOLD_AT_S + DT + 1e-9 && maxT < TOPPLE.downS - TOPPLE.riseS, `max topple t ${maxT}`);
  assert.ok(m.ai.reactions.downedT > 0);
  assert.equal(m._questDown, 'held');
});

test('the 80 m rule and the view rule each keep it down; past both it gets up and goes home calm on its leash', () => {
  const { w, td } = rig();
  const m = plumb();
  m.topple();
  run(m, td, 2);
  // 79 m out, out of view: still within NEAR_M
  w.p = { x: m.position.x, z: m.position.z + NEAR_M - 1 };
  run(m, td, 10);
  assert.equal(m.state, 'downed');
  // 81 m out but she looks at it
  w.p = { x: m.position.x, z: m.position.z + NEAR_M + 1 }; w.view = true;
  run(m, td, 10);
  assert.equal(m.state, 'downed');
  assert.equal(m._questDown, 'held');
  // 81 m, looking away: it rises (0.6 s of the topple's rise left after the hold), then 'return'
  w.view = false;
  run(m, td, 3);
  assert.equal(m._questDown, 'up');
  assert.equal(m._toppleT, -1);
  assert.equal(m.state, 'return');
  assert.equal(m._alertEpisode, false, 'its alert episode is over');
  assert.deepEqual(m.territory, { x: TERRACE.x, z: TERRACE.z, r: HOME.r });
  assert.equal(m.ai.engage.cfg.leash, HOME.leash);
  assert.equal(m.ai.engage.cfg.band[0], 9, 'the rest of its engage row is kept');
  const rising = td.log.find((e) => e.state === 'rising');
  assert.ok(rising.d > NEAR_M, `rose with her ${rising.d} m off`);
});

test('chain 3 (c9f130e) replayed: she walks from the topple stand to where she was felled; it gets up only past 80 m', () => {
  const { w, td } = rig();
  const m = plumb({ ...STAND, x: STAND.x - 11 });
  m.topple();
  run(m, td, 4.5);   // 'barbed' at the stand
  const L = Math.hypot(FELLED.x - STAND.x, FELLED.z - STAND.z);
  let upAt = null;
  // her walk at 1.4 m/s, the camera behind her (the Plumb is never in her view once she turns her back)
  run(m, td, L / 1.4, (t) => {
    const k = Math.min(1, (t * 1.4) / L);
    w.p = { x: STAND.x + (FELLED.x - STAND.x) * k, z: STAND.z + (FELLED.z - STAND.z) * k };
    if (upAt == null && m.state !== 'downed') upAt = Math.hypot(m.position.x - w.p.x, m.position.z - w.p.z);
  });
  assert.ok(upAt != null && upAt > NEAR_M, `up at ${upAt} m from her`);
  assert.equal(m.state, 'return');
  // and home: 60 m round its terrace at most, while she was felled 120 m from it
  assert.ok(Math.hypot(FELLED.x - TERRACE.x, FELLED.z - TERRACE.z) > HOME.r + HOME.leash + 48, 'beyond its leash and its 48 m sight');
});

test('once up it is never held again; a dead or disposed Plumb is left alone', () => {
  const { w, td } = rig({ player: { x: 1000, z: 1000 } });
  const m = plumb();
  m.topple();
  run(m, td, 6);
  assert.equal(m._questDown, 'up');
  w.p = { ...STAND };
  m.topple();
  run(m, td, 6);
  assert.equal(m._toppleT, -1, 'a later topple runs as the kind\'s');
  const d = plumb(); d.alive = false; d.topple(); td.step([d]);
  assert.equal(d._questDown, undefined);
});

test('a terrace Plumb already up when the stage closes goes home calm at once (no hold)', () => {
  const { td } = rig();
  const m = plumb();
  td.step([m]);
  assert.equal(m.state, 'return');
  assert.equal(m._questDown, 'up');
});

test('hour.js wires it: the step each frame, the stage read, the site clock\'s view, the report', () => {
  const h = src('src/game/hour.js');
  assert.match(h, /import \{ TerraceDown \} from '\.\/terrace-down\.js'/);
  assert.match(h, /this\._downStep\(\);\n\s+const cur = this\.scar\.current\(\)/);
  assert.match(h, /this\.scar\.st\?\.\['plumb-2'\]\?\.state === 'done'/);
  assert.match(h, /this\.sys\.siteRefill\?\.world/);
  assert.match(h, /terraceDown: this\.terraceDown \? this\.terraceDown\.log/);
});
