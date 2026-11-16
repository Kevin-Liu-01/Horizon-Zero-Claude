// M1.6n the site clock (BIBLE §17 "Sites refill on a clock"): one case per clause, and the dyke Plumb after the quest.
// Browser-free: node --test tools/gates/systems/site-clock.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SiteClock, REFILL_HOURS, NEAR_M, MEASURING, CORRECTING, kindClass, inView, errorAt } from '../../../src/game/sites/clock.js';
import { SiteRefill, HourMeter } from '../../../src/game/sites/refill.js';
import { makeRecord, parse } from '../../../src/game/save/format.js';
import { STAGES, QUEST_ID } from '../../../src/game/quest/plan.js';

const FAR = { x: 1000, z: 1000 };
const open = (over = {}) => ({ player: FAR, inView: () => false, inError: () => true, ...over });
const site = (id, kind, x = 0, z = 0) => ({ id, kind, x, z });

test('clause 1: a cleared site stays clear for 12 hours on the site clock', () => {
  assert.equal(REFILL_HOURS, 12);
  const c = new SiteClock();
  c.advance(3);
  c.clear(site(1, 'plumb'));
  c.advance(11.99);
  const v = c.verdict(1, open());
  assert.equal(v.ok, false);
  assert.equal(v.why, 'clock');
  assert.ok(Math.abs(v.left - 0.01) < 1e-9);
  c.advance(0.01);
  assert.deepEqual(c.verdict(1, open()), { ok: true, why: 'ok' });
  // clearing it again (the wreck's dispose after its kill) keeps the first hour
  const c2 = new SiteClock();
  c2.clear(site(2, 'peg'));
  c2.advance(6);
  c2.clear(site(2, 'peg'));
  c2.advance(6);
  assert.equal(c2.verdict(2, open()).ok, true);
});

test('clause 1: the site clock is hours played plus hours slept (the HourMeter)', () => {
  const c = new SiteClock(), h = new HourMeter(c);
  assert.equal(h.read(7.0), 0, 'the first read only sets the hour');
  h.read(7.5);
  h.read(8.25);
  assert.equal(c.hours, 1.25, 'hours played: the hour\'s forward steps');
  h.read(23.9); // a jump of over an hour (a record's hour put back) is not played time
  assert.equal(c.hours, 1.25);
  h.read(0.1);  // across midnight
  assert.ok(Math.abs(c.hours - 1.45) < 1e-9);
  // a rest from 18:00 until dawn (07:00): 13 hours slept, counted when it begins, not the fade's frames
  h.resync(18);
  assert.equal(h.restStart(18, 7), 13);
  h.read(21); h.read(3); h.read(6.9);
  h.restEnd(7);
  assert.ok(Math.abs(c.hours - 14.45) < 1e-9);
  h.read(7.2);
  assert.ok(Math.abs(c.hours - 14.65) < 1e-9);
  // never backwards
  c.advance(-5); c.advance(NaN);
  assert.ok(Math.abs(c.hours - 14.65) < 1e-9);
});

test('clause 2: measuring kinds (Peg, Plumb, Tiller, Sonde) return in any region, true ground included', () => {
  assert.deepEqual([...MEASURING], ['peg', 'plumb', 'tiller', 'sonde']);
  const c = new SiteClock();
  MEASURING.forEach((k, i) => c.clear(site(i, k)));
  c.advance(12);
  for (let i = 0; i < MEASURING.length; i++) {
    assert.equal(c.verdict(i, open({ inError: () => false })).ok, true, `${MEASURING[i]} on true ground`);
    assert.equal(c.verdict(i, open({ inError: () => true })).ok, true, `${MEASURING[i]} in error`);
  }
});

test('clause 3: correcting kinds (Screed, Kiln, Sickle, Spindle, Davit) return only where the ground is in error', () => {
  assert.deepEqual([...CORRECTING], ['screed', 'kiln', 'sickle', 'spindle', 'davit']);
  const c = new SiteClock();
  CORRECTING.forEach((k, i) => c.clear(site(i, k)));
  c.clear(site(99, 'gauge'));   // a kind the bible names in neither list: the correcting rule
  c.advance(12);
  for (const i of [...CORRECTING.keys(), 99]) {
    assert.deepEqual(c.verdict(i, open({ inError: () => false })), { ok: false, why: 'true-ground' });
    assert.equal(c.verdict(i, open({ inError: () => true })).ok, true);
  }
  assert.equal(kindClass('Screed'), 'correcting');
  assert.equal(kindClass('transit'), 'other');
  // the ground's error from a datum: no datum, all in error; a re-surveyed region is true inside its circle
  assert.equal(errorAt(null, 0, 0), true);
  const datum = { regions: () => [{ id: 'pans', x: 0, z: 0, r: 50 }], regionTrue: (id) => id === 'pans' };
  assert.equal(errorAt(datum, 10, 10), false);
  assert.equal(errorAt(datum, 60, 0), true);
  assert.equal(errorAt({ trueAt: (x) => x < 0 }, -1, 0), false);
  assert.equal(errorAt({ inError: () => false }, 5, 5), false);
});

test('clause 4: nothing returns within 80 m of Brea', () => {
  assert.equal(NEAR_M, 80);
  const c = new SiteClock();
  c.clear(site(1, 'peg', 0, 0));
  c.advance(12);
  assert.deepEqual(c.verdict(1, open({ player: { x: 79.9, z: 0 } })), { ok: false, why: 'near' });
  assert.deepEqual(c.verdict(1, open({ player: { x: 0, z: 0 } })), { ok: false, why: 'near' });
  assert.equal(c.verdict(1, open({ player: { x: 80.1, z: 0 } })).ok, true);
});

test('clause 5: nothing returns inside her view (the camera frustum to its far plane)', () => {
  const c = new SiteClock();
  c.clear(site(1, 'peg', 0, 300));
  c.advance(12);
  // she stands 300 m off, the camera looking at the site / looking away
  const cam = (dz, extra = {}) => ({ x: 0, y: 2, z: 0, dx: 0, dy: 0, dz, fov: 60, aspect: 16 / 9, far: 1500, ...extra });
  const world = (k) => open({ player: { x: 0, z: 0 }, inView: (x, z) => inView(k, { x, y: 0, z }) });
  assert.deepEqual(c.verdict(1, world(cam(1))), { ok: false, why: 'view' });
  assert.equal(c.verdict(1, world(cam(-1))).ok, true, 'behind her');
  assert.equal(c.verdict(1, world(cam(1, { far: 250 }))).ok, true, 'past the far plane');
  // the frustum's edge: 16:9 at a 60 deg vertical fov is 49.7 deg to the corner, and 6 deg of margin
  const at = (deg) => inView(cam(1), { x: Math.sin(deg * Math.PI / 180) * 300, y: 0.8, z: Math.cos(deg * Math.PI / 180) * 300 });
  assert.equal(at(55), true);
  assert.equal(at(-55), true);
  assert.equal(at(56.5), false);
});

test('clause 6: nothing returns at a site inside true ground that a quest has emptied', () => {
  const c = new SiteClock();
  c.clear(site(1, 'peg'), { emptiedBy: QUEST_ID });
  c.clear(site(2, 'peg'));
  c.advance(500);
  assert.deepEqual(c.verdict(1, open({ inError: () => false })), { ok: false, why: 'quest-true' });
  assert.equal(c.verdict(2, open({ inError: () => false })).ok, true, 'the same kind, not emptied by a quest');
  assert.equal(c.verdict(1, open({ inError: () => true })).ok, true, 'emptied by a quest but still in error: on the clock');
});

test('clause 7: what the quest spawned for itself never returns on the clock', () => {
  const c = new SiteClock();
  c.clear(site(1, 'plumb'), { quest: true });
  c.advance(10000);
  assert.deepEqual(c.verdict(1, open()), { ok: false, why: 'quest' });
  assert.deepEqual(c.due(open()), []);
});

test('the clock rides in the save record (serialize, makeRecord, parse, restore)', () => {
  const c = new SiteClock();
  c.advance(3.25);
  c.clear(site(4, 'plumb', -294.83, 259.36), { quest: true });
  c.clear(site(2, 'peg', 10, 20), { emptiedBy: QUEST_ID });
  const rec = makeRecord({ quest: null, satchel: {}, ammo: {}, position: {}, sites: c.serialize() }, { savedAt: 1 });
  const back = parse(JSON.stringify(rec));
  assert.deepEqual(back.sites, c.serialize());
  const c2 = new SiteClock().restore(back.sites);
  assert.equal(c2.hours, 3.25);
  assert.deepEqual(c2.get(4), { id: 4, kind: 'plumb', x: -294.83, z: 259.36, at: 3.25, quest: true, emptiedBy: null });
  assert.equal(c2.get(2).emptiedBy, QUEST_ID);
  // a v6 record from before the clock: a fresh clock
  const old = makeRecord({ quest: null, satchel: {}, ammo: {}, position: {} }, { savedAt: 1 });
  assert.equal(old.sites, null);
  assert.equal(new SiteClock().restore(old.sites).hours, 0);
});

/* ------------------------------------------------------------------ live */

/** A machines system as the runtime sees it: spawn() notes a site (as Machines._spawnCls does), dispose() schedules
 * the stock respawn (as SiteManager.dispose does), and stock() runs the stock scheduler's respawn check. */
function fakeWorld() {
  const events = [];
  let nextId = 1;
  const M = {
    list: [],
    sites: { sites: [], respawned: 0, clock: 0 },
    spawn(kind, x, z, opts = {}) {
      const m = { kind, alive: true, position: { x, z } };
      if (opts._site) { opts._site.machine = m; m._site = opts._site; } else {
        const s = { id: nextId++, kind, x, z, opts: {}, machine: m, respawnAt: 0, pending: false };
        m._site = s; M.sites.sites.push(s);
      }
      M.list.push(m);
      return m;
    },
    kill(m) { m.alive = false; },
    dispose(m) { const s = m._site; M.list.splice(M.list.indexOf(m), 1); s.machine = null; s.pending = true; s.respawnAt = M.sites.clock + 300; },
    stock(dt) { // the stock scheduler: respawn when its timer is up
      M.sites.clock += dt;
      for (const s of M.sites.sites) if (s.pending && !s.machine && M.sites.clock >= s.respawnAt) { M.spawn(s.kind, s.x, s.z, { _site: s }); s.pending = false; }
    },
  };
  const state = { player: { x: 0, z: 0 }, camera: null, stages: [] };
  const clock = new SiteClock();
  const R = new SiteRefill({
    machines: () => M, player: () => state.player, camera: () => state.camera, datum: () => null,
    questStages: () => state.stages, emit: (n, e) => events.push({ n, e }),
  }, clock);
  return { M, R, clock, state, events };
}

test('live: the dyke Plumb does not return after the quest; a site Plumb does, on the clock', () => {
  const { M, R, clock, state, events } = fakeWorld();
  const st = (id) => { const s = STAGES.find((q) => q.id === id); return { quest: QUEST_ID, id: s.id, type: s.type, kind: s.kind ?? null }; };
  // a Plumb at a world site, and the ditch stage's Plumb at the station (runtime._spawn owns it for the quest)
  const world = M.spawn('plumb', 400, 0);
  const dyke = M.spawn('plumb', -294.83, 259.36);
  R.own(dyke, QUEST_ID);
  // the quest: topple, then pry, kills the dyke Plumb; the world Plumb dies on the way home (no stage asks for it)
  state.stages = [st('pry')];
  R.killed(dyke); M.kill(dyke);
  state.stages = [st('return')];
  R.killed(world); M.kill(world);
  M.dispose(dyke); R.disposed(dyke._site.id);
  M.dispose(world); R.disposed(world._site.id);
  assert.equal(dyke._site.respawnAt, Infinity, 'the stock timer is taken off the dyke site');
  assert.equal(world._site.respawnAt, Infinity);
  // the quest is done; she walks off, 200 m from both, looking away; the hours pass
  state.stages = [];
  state.player = { x: 200, z: 400 };
  for (let h = 0; h < 100; h += 0.25) {
    clock.advance(0.25);
    M.stock(900);    // the stock scheduler, which would have filled both at 300 s
    R.update(1);
  }
  const ds = M.sites.sites.find((s) => s === dyke._site), ws = M.sites.sites.find((s) => s === world._site);
  assert.equal(ds.pending, true, 'the dyke Plumb is not back');
  assert.equal(ds.machine, null);
  assert.equal(R.clock.verdict(ds.id, R.world).why, 'quest');
  assert.equal(ws.pending, false, 'the world Plumb is back');
  assert.equal(ws.machine.kind, 'plumb');
  assert.equal(R.filled, 1);
  // ...and it came back at 12 hours on the clock (the first sweep at or after 12 h), by the site clock
  assert.equal(R.log[0].hour, 12);
  assert.equal(events.filter((x) => x.n === 'machine-respawned').length, 1);
  assert.equal(events[0].e.by, 'site-clock');
});

test('live: a kill a running stage asks for is a quest emptying the site; a pending site the clock never saw is cleared now', () => {
  const { M, R, clock, state } = fakeWorld();
  const peg = M.spawn('peg', 50, 50);
  state.stages = [{ quest: QUEST_ID, id: 'cross', type: 'goto', kind: null }, { quest: QUEST_ID, id: 'lamps', type: 'kill', kind: 'peg' }];
  const e = R.killed(peg);
  assert.equal(e.emptiedBy, QUEST_ID);
  assert.equal(e.quest, false);
  // a site disposed by a roster restore, with no kill seen: the sweep clears it at this hour
  const tiller = M.spawn('tiller', 900, 900);
  clock.advance(5);
  M.dispose(tiller);
  state.player = { x: 0, z: 0 };
  R.sweep();
  assert.equal(clock.get(tiller._site.id).at, 5);
  assert.equal(tiller._site.respawnAt, Infinity);
  // a kill under an id a record's entry left for another site (another kind, or another place) starts its own entry
  clock.cleared.set(77, { id: 77, kind: 'peg', x: 5, z: 5, at: 0, quest: true, emptiedBy: null });
  const ctl = clock.clear({ id: 77, kind: 'plumb', x: 300, z: 300 });
  assert.equal(ctl.quest, false);
  assert.equal(ctl.at, clock.hours);
  clock.cleared.set(78, { id: 78, kind: 'plumb', x: 5, z: 5, at: 0, quest: true, emptiedBy: null });
  assert.equal(clock.clear({ id: 78, kind: 'plumb', x: 5.5, z: 5 }).quest, true, 'the same site (within 1 m) keeps its mark');
  // a record's entry left under an id that now names another site is not trusted
  clock.cleared.set(tiller._site.id, { id: tiller._site.id, kind: 'screed', x: 0, z: 0, at: -100, quest: false, emptiedBy: null });
  clock.advance(1);
  R.sweep();
  assert.equal(clock.get(tiller._site.id).kind, 'tiller');
  assert.equal(clock.get(tiller._site.id).at, 6);
});

test('live: the view and the 80 m hold a due site back until she is away and turned', () => {
  const { M, R, clock, state } = fakeWorld();
  const peg = M.spawn('peg', 0, 300);
  R.killed(peg); M.kill(peg); M.dispose(peg);
  clock.advance(12);
  state.player = { x: 0, z: 250 };
  assert.equal(R.sweep(), 0, 'within 80 m');
  state.player = { x: 0, z: 0 };
  state.camera = { x: 0, y: 2, z: -4, dx: 0, dy: 0, dz: 1, fov: 60, aspect: 16 / 9, far: 1500 };
  assert.equal(R.sweep(), 0, 'in view');
  state.camera.dz = -1;
  assert.equal(R.sweep(), 1, 'away and turned');
  assert.equal(peg._site.pending, false);
});
