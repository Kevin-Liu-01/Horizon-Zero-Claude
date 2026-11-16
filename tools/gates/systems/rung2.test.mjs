// M1.6l rung 2, the Scout (Guild Whites): the file is fitted over the Starter and inside its budget; its pieces are the
// bible's; the save keeps what she wears. Browser-free: node --test tools/gates/systems/rung2.test.mjs
// (The perk, Shrug, is graded live by A-armor-verb: a Flag on her ends at 3 s in Guild Whites and at 8 s without.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { io } from '../../build/recipes/lib/human/face.mjs';
import { makeRecord } from '../../../src/game/save/format.js';
import { ROOT } from './lib.mjs';

const FILE = path.join(ROOT, 'public/models/armory/armor-pan-2.glb');

test('rung 2: the file holds only the Scout\'s pieces, fitted over the Starter, <= 0.15 MB, no texture of its own', async () => {
  const bytes = statSync(FILE).size;
  assert.ok(bytes <= 150000, `armor-pan-2.glb is ${bytes} bytes (cap 150,000)`);
  const doc = await (await io()).read(FILE);
  const x = doc.getRoot().getAsset().extras.r5Outfit;
  assert.equal(x.over, 'heroOutfitPan1');
  assert.equal(x.sharedAtlas, 'heroOutfitPan1');
  assert.deepEqual(x.pieces, ['vest', 'guard', 'legwrap', 'hat']);
  assert.equal(doc.getRoot().listTextures().length, 0);
  // the hat: three copies (on her head 32, on her back over the bow 64, close in 128), and the rest always shown
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const piece = prim.getAttribute('_PIECE');
  const seen = new Set();
  for (let i = 0; i < piece.getCount(); i++) seen.add(piece.getScalar(i));
  assert.deepEqual([...seen].sort((a, b) => a - b), [0, 32, 64, 128]);
  // the crown clears her wrap and the tail leaves under the brim with room (the recipe's own fit, measured off brea.glb)
  assert.ok(x.hat.brimRoom >= 0.02, `brim room ${x.hat.brimRoom} m`);
});

test('rung 2: one-side shoulder guard (her left only) and leg wraps on both shins', async () => {
  const doc = await (await io()).read(FILE);
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const P = prim.getAttribute('POSITION'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
  const names = doc.getRoot().listSkins()[0].listJoints().map((j) => j.getName());
  const node = doc.getRoot().listNodes().find((n) => n.getMesh());
  const s = node.getScale?.() || [1, 1, 1];
  void s;
  let left = 0, right = 0;
  const j4 = [0, 0, 0, 0], w4 = [0, 0, 0, 0];
  for (let i = 0; i < P.getCount(); i++) {
    J.getElement(i, j4); W.getElement(i, w4);
    let top = 0; for (let k = 1; k < 4; k++) if (w4[k] > w4[top]) top = k;
    const n = names[j4[top]];
    if (n === 'upperarm_l') left++;
    if (n === 'upperarm_r') right++;
  }
  assert.ok(left > 100, `left upper arm carries ${left} vertices of the guard`);
  assert.equal(right, 0, 'nothing of the Scout rides her right upper arm');
  const legs = { calf_l: 0, calf_r: 0 };
  for (let i = 0; i < P.getCount(); i++) {
    J.getElement(i, j4); W.getElement(i, w4);
    let top = 0; for (let k = 1; k < 4; k++) if (w4[k] > w4[top]) top = k;
    if (names[j4[top]] in legs) legs[names[j4[top]]]++;
  }
  assert.ok(legs.calf_l > 40 && legs.calf_r > 40, JSON.stringify(legs));
});

test('rung 2: the save keeps the armour she wears beside the rung she owns', () => {
  const rec = makeRecord({ loadout: { weapon: null, activeAmmo: {}, rung: 'scout', wear: 'pan-2', quick: [] } }, { kind: 'named', reason: 'test', slot: 1, savedAt: 0 });
  assert.equal(rec.loadout.rung, 'scout');
  assert.equal(rec.loadout.wear, 'pan-2');
  const old = makeRecord({ loadout: { rung: 'starter' } }, { kind: 'named', reason: 'test', slot: 1, savedAt: 0 });
  assert.equal(old.loadout.wear, null);
});

test('rung 2: the reward pays rung 2 (Raker\'s Morning) and the runtime puts rung 2 on as the Scout armour', () => {
  const plan = readFileSync(path.join(ROOT, 'src/game/quest/plan.js'), 'utf8');
  assert.match(plan, /REWARD = Object\.freeze\(\{ rung: 'scout'/);
  const rt = readFileSync(path.join(ROOT, 'src/game/runtime.js'), 'utf8');
  assert.match(rt, /RUNG_ARMOR = Object\.freeze\(\{ starter: 'pan-1', scout: 'pan-2' \}\)/);
  assert.match(rt, /_reward\(r, words\) \{[\s\S]*?this\.wear\(r\.rung\)/);
});
