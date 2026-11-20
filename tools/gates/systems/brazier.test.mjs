// M1.6c the Brazier: the refusal within 60 m of a wary Plumb, the six strings, the forecast line, the four hours.
// Browser-free: node --test tools/gates/systems/brazier.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refusedBy, dialogFor, brazierStrings, forecastLine, REST_HOURS, REFUSE_RADIUS, BRAZIERS } from '../../../src/game/brazier/rules.js';
import { loadText } from './lib.mjs';

const T = loadText().systems;
const cistern = BRAZIERS.find((b) => b.id === 'cistern');
const t1 = BRAZIERS.find((b) => b.id === 't1');
const at = (d, lamp) => ({ x: d, z: 0, lamp, kind: 'plumb' });

test('refused within 60 m of a wary or hostile Plumb; allowed beyond, or when it is calm or dark', () => {
  assert.equal(REFUSE_RADIUS, 60);
  assert.ok(refusedBy(0, 0, [at(59.9, 'wary')]));
  assert.ok(refusedBy(0, 0, [at(30, 'hostile')]));
  assert.equal(refusedBy(0, 0, [at(60.1, 'wary')]), null);
  assert.equal(refusedBy(0, 0, [at(10, 'calm')]), null);
  assert.equal(refusedBy(0, 0, [at(10, 'dark')]), null);
  const lit = new Set(['cistern']);
  const refused = dialogFor(T, cistern, { lit, x: 0, z: 0, machines: [at(40, 'wary')] });
  assert.equal(refused.mode, 'refused');
  assert.equal(refused.line, 'THE LAMPS ARE UP. NO REST HERE.');
  assert.equal(refused.rows.length, 0);
});

test('the dialog prints exactly the bible\'s six strings', () => {
  assert.deepEqual(brazierStrings(T), [
    'KINDLE', 'REST UNTIL DAWN', 'REST UNTIL GOLDEN', 'REST UNTIL DUSK', 'REST UNTIL NIGHT', 'THE LAMPS ARE UP. NO REST HERE.',
  ]);
  const lit = new Set(['cistern']);
  const d = dialogFor(T, cistern, { lit, x: 0, z: 0, machines: [], weather: { state: 'trade', windFrom: 45, speed: 5 } });
  assert.equal(d.mode, 'rest');
  assert.deepEqual(d.rows.map((r) => r.label), ['REST UNTIL DAWN', 'REST UNTIL GOLDEN', 'REST UNTIL DUSK', 'REST UNTIL NIGHT']);
  // the prompt is the bible row's own word, "REST UNTIL …"
  assert.equal(d.prompt, 'REST UNTIL …');
  const k = dialogFor(T, t1, { lit: new Set(), unlocked: new Set(['t1']), x: 0, z: 0, machines: [] });
  assert.equal(k.mode, 'kindle');
  assert.equal(k.prompt, 'KINDLE');
  assert.equal(dialogFor(T, t1, { lit: new Set(), unlocked: new Set(), x: 0, z: 0, machines: [] }).mode, 'locked');
});

test('the forecast line is one line in the bible\'s form; rest chooses the hour, not the weather', () => {
  assert.equal(forecastLine(T, REST_HOURS.dawn, { state: 'trade', windFrom: 45, speed: 5 }), 'TRADE · WIND 045 AT 5 m/s');
  // (M2 fix wave 2) a row is the weather at its own hour: dawn is five hours before a noon calima (the trade); the hour
  // within CALIMA_SOON_H before it reads the calima's coming
  assert.equal(forecastLine(T, REST_HOURS.dawn, { state: 'trade', windFrom: 45, speed: 5, calimaAt: 12 }), 'TRADE · WIND 045 AT 5 m/s');
  assert.equal(forecastLine(T, 11.5, { state: 'trade', windFrom: 45, speed: 5, calimaAt: 12 }), 'CALIMA BY NOON');
  assert.equal(forecastLine(T, REST_HOURS.golden, { state: 'trade', windFrom: 45, speed: 5, calimaAt: 12 }), 'TRADE · WIND 045 AT 5 m/s');
  assert.deepEqual(Object.keys(REST_HOURS), ['dawn', 'golden', 'dusk', 'night']);
  assert.ok(REST_HOURS.golden > 18 && REST_HOURS.golden < 19);
});

test('the refusal reads the lamps as the lamps system does: machines publish no lampState (systems-1b fix)', async () => {
  // src/game/brazier/braziers.js machinesNear() maps each machine through instruments/lamps.js lampStateFor; round 1
  // read `m.lampState`, which no machine sets, so every Instrument was calm and the refusal could never fire live
  const { lampStateFor } = await import('../../../src/instruments/lamps.js');
  const m = (state) => ({ alive: true, state, x: 25, z: 0 });
  const read = (mm) => ({ x: mm.x, z: mm.z, lamp: mm.lampState ?? lampStateFor(mm) });
  assert.equal(lampStateFor(m('suspicious')), 'wary');
  assert.equal(lampStateFor(m('search')), 'wary');
  assert.equal(lampStateFor(m('alert')), 'hostile');
  assert.equal(lampStateFor(m('patrol')), 'calm');
  assert.equal(lampStateFor({ alive: false, state: 'alert' }), 'dark');
  const T = loadText().systems;
  const home = BRAZIERS[0];
  const at = (mm) => dialogFor(T, home, { lit: new Set(['cistern']), x: 0, z: 0, machines: [read(mm)] });
  assert.equal(at(m('suspicious')).mode, 'refused');
  assert.equal(at(m('alert')).line, 'THE LAMPS ARE UP. NO REST HERE.');
  assert.equal(at(m('patrol')).mode, 'rest');
  assert.equal(at({ ...m('alert'), x: 61 }).mode, 'rest');
  assert.equal(at({ ...m('alert'), x: 60 }).mode, 'refused');
});

test('where the Braziers stand: off the accepted frames, the cistern clear of F30\'s lens, the seat and her spawn (F05 regression fix)', async () => {
  const S = await import('../../../src/world/settlements/brazier-spots.js');
  const { REST, TRIG } = await import('../../../src/world/island/sites.js');
  const t1 = TRIG.find((t) => t.id === 'T1');
  const on = S.offsetOn;
  // F05 (look.vista, bearing 283): 5baa3e7's flattest-of-four put the T1 Brazier at the pillar's (-5, -5), 1 m from her
  assert.equal(S.clearOfFrames(t1.x - 5, t1.z - 5), false, 'the 39f7533 spot stands in F05');
  const clear = S.T1_SPOTS.filter((c) => S.clearOfFrames(c.x, c.z));
  assert.ok(clear.length >= 2, 'the runtime has a choice of spots clear of F05');
  for (const c of clear) {
    // F05's chase lens 4.2 m behind her on bearing 283: the bowl and its cistern behind it or > 45 deg off its axis
    const f = on(283, 1), lx = t1.x - 6 - f.x * 4.2, lz = t1.z - 4 - f.z * 4.2;
    for (const p of [c, { x: c.x + on(S.CISTERN.bearing, S.CISTERN.dist).x, z: c.z + on(S.CISTERN.bearing, S.CISTERN.dist).z }]) {
      const dx = p.x - lx, dz = p.z - lz, ahead = dx * f.x + dz * f.z, side = Math.abs(dx * f.z - dz * f.x);
      assert.ok(ahead < 0 || Math.atan2(side, ahead) * 180 / Math.PI > 45, `T1 spot ${c.x},${c.z} in F05's lens`);
    }
  }
  const H = S.HOME_BRAZIER, C = S.HOME_CISTERN;
  const seat = { x: H.x + on(S.SEAT.bearing, S.SEAT.dist).x, z: H.z + on(S.SEAT.bearing, S.SEAT.dist).z };
  const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  assert.ok(d(C, H) > S.CISTERN.r + 0.5, 'the cistern clears the bowl');
  assert.ok(d(C, seat) > S.CISTERN.r + 0.6, 'the cistern clears the seat');
  assert.ok(d(C, REST) > S.CISTERN.r + 1.0, 'the cistern is never on her spawn');
  // F30 (at the fire, approach 1.6 m on bearing 200, orbit yawRel 40 at 3.5 m): at 39f7533 the cistern stood 1 m from
  // the lens and filled the lower right. Now it stands beyond the bowl, at least 4 m out and inside the frame's width
  const fw = on(20, 1), left = on(290, 1), t = 40 * Math.PI / 180;
  const lens = { x: seat.x + (fw.x * Math.cos(t) + left.x * Math.sin(t)) * 3.5, z: seat.z + (fw.z * Math.cos(t) + left.z * Math.sin(t)) * 3.5 };
  assert.ok(d(C, lens) >= 4.0, `cistern ${d(C, lens).toFixed(2)} m from F30's lens`);
  assert.ok(d(C, lens) > d(H, lens), 'the cistern stands beyond the bowl from F30\'s lens');
  // F20 (at REST, bearing 200, orbit yawRel 0 at 4 m, looking back at her on bearing 20): bowl and cistern behind it
  const l20 = { x: REST.x + on(200, 4).x, z: REST.z + on(200, 4).z }, look = on(20, 1);
  for (const p of [H, C, seat]) assert.ok((p.x - l20.x) * look.x + (p.z - l20.z) * look.z < 0, 'behind F20\'s lens');
  // the flora keepouts follow the cistern
  const k = S.BRAZIER_KEEPOUTS.find((x) => x.id === 'brazier-cistern');
  assert.ok(Math.hypot(k.x - C.x, k.z - C.z) < 0.01 && k.hard >= S.CISTERN.r + 0.4);
});
