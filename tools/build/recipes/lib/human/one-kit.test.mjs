/**
 * M1.2a: one human kit. Brea's recipe and the NPC recipe must reach the same six library modules under
 * tools/build/recipes/lib/human/, and no other file under tools/build/recipes may define the kit's entry points (a
 * forked copy is how the NPCs fell behind Brea before). Node only, no sources needed:
 *
 *   node --test tools/build/recipes/lib/human/one-kit.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RECIPES = path.resolve(HERE, '../..');
const KIT = ['face', 'hair', 'skin', 'skin-human', 'wrap', 'wrap-head'].map((n) => path.join(HERE, `${n}.mjs`));
// entry points that only the kit may define
const OWN = ['paintHumanSkin', 'browLayer', 'lashCard', 'woundHeadwrap', 'paintWrapAtlas', 'relayoutSkinUV', 'saltPaste', 'clothTail', 'faceField'];

/** Every local module reachable from `file` by static and literal dynamic imports. */
function reach(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  const re = /(?:from\s+|import\s*\(\s*)['"](\.{1,2}\/[^'"]+\.mjs)['"]/g;
  for (let m; (m = re.exec(src));) reach(path.resolve(path.dirname(file), m[1]), seen);
  return seen;
}
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else if (n.endsWith('.mjs')) out.push(p);
  }
  return out;
}

test('Brea and the NPC cast reach the same kit modules', () => {
  const brea = reach(path.join(RECIPES, 'brea.mjs'));
  const npc = reach(path.join(RECIPES, 'npc/build.mjs'));
  for (const k of KIT) {
    assert.ok(brea.has(k), `brea.mjs does not reach ${path.relative(RECIPES, k)}`);
    assert.ok(npc.has(k), `npc/build.mjs does not reach ${path.relative(RECIPES, k)}`);
  }
});

test('no forked copy of the kit under tools/build/recipes', () => {
  const kit = new Set(KIT);
  for (const f of walk(RECIPES)) {
    if (kit.has(f)) continue;
    const src = readFileSync(f, 'utf8');
    for (const name of OWN) assert.ok(!new RegExp(`export\\s+(async\\s+)?function\\s+${name}\\b`).test(src), `${path.relative(RECIPES, f)} defines ${name}: fold it into lib/human/`);
  }
});
