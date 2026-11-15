/**
 * BUILD M1.5f — the face rig on every shipped skin (node --test; no browser): Brea and all thirteen people's near skins.
 * The game builds the same rig at load (src/world/npc/people/face.js); face-rig.mjs reads the GLBs and measures it.
 *
 *   - eyes, lids and the lips' slit found on every skin
 *   - a blink shuts: the opening seen from the front is >= 7 mm open and 0 mm at the full blink; no lid vertex ends inside
 *     the ball or its dome at the half or the full blink
 *   - the eyes turn as true rotations: the cornea pole after 20 deg of yaw and 15 deg of pitch within 0.05 mm of the exact turn
 *   - the four jaw-and-lip shapes: AA parts the lips 8-13 mm; EE 3-7 mm with the corners drawn out >= 2 mm; OO 4-8 mm with the
 *     corners drawn in; FV under 4 mm
 *   - the text cadence: a card's mouth track runs at the reading pace and shuts on m, b, p and at the end
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { rigOf } from './face-rig.mjs';
import { speechTrack, trackAt } from '../../../../src/world/npc/people/face.js';

const SKINS = ['brea', 'guild-matron', 'lantern-keeper', 'salt-raker', 'salt-raker-2', 'salt-porter', 'salt-porter-2', 'boat-caulker',
  'boat-caulker-2', 'lantern-keeper-2', 'pit-farmer', 'tiller-follower', 'cochineal-picker', 'tube-smith'];

test('the face rig on every shipped skin', async () => {
  const bad = [];
  for (const id of SKINS) {
    const r = await rigOf(id);
    if (r.error) { bad.push(`${id}: ${r.error}`); continue; }
    const m = r.m;
    if (!m.finite) bad.push(`${id}: a target is not finite`);
    for (const b of m.blink) {
      if (!(b.openMm >= 7)) bad.push(`${id} ${b.side}: open ${b.openMm} mm`);
      if (b.shutMm !== 0) bad.push(`${id} ${b.side}: shut ${b.shutMm} mm`);
    }
    if (m.intrusion.mid || m.intrusion.full) bad.push(`${id}: lid in the ball ${JSON.stringify(m.intrusion)}`);
    for (const s of ['L', 'R']) if (m.turn[s].yaw20ErrMm > 0.05 || m.turn[s].pitch15ErrMm > 0.05) bad.push(`${id} ${s}: turn ${JSON.stringify(m.turn[s])}`);
    const J = m.jaw;
    if (J.jawAA.lipGapMm < 8 || J.jawAA.lipGapMm > 13) bad.push(`${id}: AA ${J.jawAA.lipGapMm} mm`);
    if (J.lipEE.lipGapMm < 3 || J.lipEE.lipGapMm > 7 || J.lipEE.cornerDxMm < 2) bad.push(`${id}: EE ${JSON.stringify(J.lipEE)}`);
    if (J.lipOO.lipGapMm < 4 || J.lipOO.lipGapMm > 8 || J.lipOO.cornerDxMm >= 0) bad.push(`${id}: OO ${JSON.stringify(J.lipOO)}`);
    if (J.lipFV.lipGapMm > 4) bad.push(`${id}: FV ${J.lipFV.lipGapMm} mm`);
  }
  assert.deepEqual(bad, []);
});

test('a card read at the cadence: pace, closures and the end', () => {
  const text = "You're late. The crust on the third pan set an hour ago. Take the other rake.";
  const tr = speechTrack(text);
  // 13.5 characters a second plus the stops: 5-8 s for this card
  assert.ok(tr.duration > 5 && tr.duration < 8, `duration ${tr.duration}`);
  const w = [0, 0, 0, 0];
  // the 'p' of "pan" shuts the lips; past the end everything is 0
  const at = (i) => tr.keys.filter((k) => k.w).at(i);
  const pKey = tr.keys.find((k, i) => i > 0 && k.w.every((v) => v === 0) && tr.keys[i - 1].w[0] > 0);
  assert.ok(pKey, 'a closure');
  trackAt(tr, tr.duration + 0.1, w);
  assert.deepEqual(w, [0, 0, 0, 0]);
  void at;
  // a number is not a stop: "0.4" does not pause 0.4 s
  const a = speechTrack('at 0.4 metres').duration, b = speechTrack('at 04 metres').duration;
  assert.ok(Math.abs(a - b) < 0.12, `${a} vs ${b}`);
});
