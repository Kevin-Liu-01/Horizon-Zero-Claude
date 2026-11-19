/**
 * F36's five at work, in Node (M2 fix wave, area B): the staging's list (src/world/npc/people/holds.js AT_WORK) is five of the
 * Holds cast, no one twice, each at a place that resolves, clear of the cistern's kerb, the tree's trunk and the dwellings,
 * at least 1.2 m from each other, in a clip the shared pack has, held inside the part of the clip where its hands are at the
 * work (the at-work probe's sweep at 207441b: Fixing_Kneeling kneels from 0.17 to 0.85 of it, Farm_PlantSeed bends from 0.25
 * to 0.65, Chest_Open reaches lowest at 0.33-0.46; Farm_Watering holds the can throughout). The count in the frame itself is
 * the probe's (tools/build/settlements/at-work-probe-page.mjs, in Chrome).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AT_WORK, HOLDS_CAST, holdsPlaces } from '../../../src/world/npc/people/holds.js';
import { PLACES, DWELLINGS, dwellingPlace } from '../../../src/world/settlements/ninewalls-layout.js';

const WINDOW = { Fixing_Kneeling: [0.17, 0.85], Farm_PlantSeed: [0.25, 0.65], Chest_Open: [0.33, 0.46], Farm_Watering: [0, 1] };

/** The clip names in the shared pack (the GLB's JSON chunk). */
function packNames() {
  const b = readFileSync(new URL('../../../public/models/npc/npc-clips.glb', import.meta.url));
  const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
  return new Set(j.animations.map((a) => a.name.split('|').pop()));
}

test('F36: five of the cast at work, apart, clear of the street furniture, held in the working part of their clips', () => {
  assert.equal(AT_WORK.length, 5);
  const ids = AT_WORK.map((w) => w.id);
  assert.equal(new Set(ids).size, 5, 'no one twice');
  for (const id of ids) assert.ok(HOLDS_CAST.includes(id), `${id} is of the Holds cast`);
  const P = holdsPlaces(), names = packNames();
  const at = (v) => (typeof v !== 'string' ? v : v.startsWith('door:') ? P.doors[v.slice(5)] : v.startsWith('house:') ? P.doors[v.slice(6)].house : P[v]);
  const spots = AT_WORK.map((w) => ({ w, p: at(w.place), f: at(w.face) }));
  for (const { w, p, f } of spots) {
    assert.ok(p && Number.isFinite(p.x) && Number.isFinite(p.z), `${w.id}: its place resolves`);
    assert.ok(f && Number.isFinite(f.x), `${w.id}: what it faces resolves`);
    const C = PLACES.cistern, T = PLACES.tree;
    assert.ok(Math.hypot(p.x - C.x, p.z - C.z) >= C.r + 0.5, `${w.id}: outside the cistern's kerb`);
    assert.ok(Math.hypot(p.x - T.x, p.z - T.z) >= T.trunkR + 0.9, `${w.id}: clear of the trunk`);
    for (const d of DWELLINGS) {
      const q = dwellingPlace(d), c = Math.cos(q.ry), s = Math.sin(q.ry), dx = p.x - q.x, dz = p.z - q.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      assert.ok(Math.abs(lx) > d.w / 2 + 0.3 || Math.abs(lz) > d.d / 2 + 0.3, `${w.id}: outside dwelling ${d.id}`);
    }
    assert.ok(names.has(w.clip), `${w.id}: the pack has ${w.clip}`);
    const win = WINDOW[w.clip];
    assert.ok(win, `${w.id}: ${w.clip} has a measured working window`);
    assert.ok(w.offset >= win[0] && w.offset <= win[1], `${w.id}: held at ${w.offset} inside ${win.join('-')} of ${w.clip}`);
    assert.notEqual(w.hold, false, `${w.id}: held (time scale 0)`);
  }
  for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
    const a = spots[i].p, b = spots[j].p;
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 1.2, `${spots[i].w.id} and ${spots[j].w.id} apart`);
  }
});
