/**
 * Size classes, the per-class caps and the encounter rule (src/instruments/lib/sizeclass.js; M2 wave 0, D6), browser-free:
 *   node --test tools/instruments/sizeclass.test.mjs
 * Reads every kind module's declared class from its source text (the modules import three and Vite globs, so node does
 * not load them), grades each kind's model against its class's caps, and grades the pure encounter rule.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SIZE_CLASSES, CLASS_CAPS, ENCOUNTER, weightOf, buildSizeClasses, encounterVerdict, encounterAllows,
} from '../../src/instruments/lib/sizeclass.js';
import { inspectGlb } from '../tier0/lib/glb.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const KINDS = path.join(ROOT, 'src/instruments/kinds');

/** Bible §7.4, the roster's sizes (the twelve kinds; the ones not built yet are graded when they land). */
const BIBLE = {
  peg: 'small', plumb: 'small', tiller: 'medium', gauge: 'medium', sickle: 'medium', spindle: 'medium', davit: 'medium',
  sonde: 'small', screed: 'large', kiln: 'large', dredge: 'large', transit: 'colossal',
};

/** { id, sizeClass, url } of every kind module (a module with a default export carrying an id). */
function readDescriptors() {
  const out = [];
  for (const f of fs.readdirSync(KINDS).filter((n) => n.endsWith('.js')).sort()) {
    const src = fs.readFileSync(path.join(KINDS, f), 'utf8');
    const at = src.indexOf('export default {');
    if (at < 0) continue;
    const head = src.slice(at, at + 800);
    const id = /\bid: '([\w-]+)'/.exec(head)?.[1];
    if (!id) continue;
    out.push({ id, sizeClass: /\bsizeClass: '(\w+)'/.exec(head)?.[1], url: /const URL = '([^']+)'/.exec(src)?.[1] ?? null });
  }
  return out;
}

test('every kind module declares a size class, and it is the bible\'s', () => {
  const ds = readDescriptors();
  assert.ok(ds.length >= 4, `kind modules found: ${ds.length}`);
  const sized = buildSizeClasses(ds);
  assert.deepEqual(sized.undeclared, [], 'undeclared');
  for (const d of ds) assert.equal(d.sizeClass, BIBLE[d.id], `${d.id}: ${d.sizeClass} (bible ${BIBLE[d.id]})`);
});

test('each kind\'s model is inside its declared class\'s triangle cap', () => {
  for (const d of readDescriptors()) {
    if (!d.url) continue;
    const f = path.join(ROOT, 'public', d.url);
    if (!fs.existsSync(f)) continue;
    const g = inspectGlb(fs.readFileSync(f));
    const cap = CLASS_CAPS[d.sizeClass].triangles;
    assert.ok(g.triangles <= cap, `${d.id} (${d.sizeClass}): ${g.triangles} triangles > ${cap}`);
  }
});

test('tier 0\'s budget table agrees with the declared classes and the caps', () => {
  const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/tier0/budgets.json'), 'utf8')).perAsset.instruments;
  for (const d of readDescriptors()) if (B.classOf[d.id]) assert.equal(B.classOf[d.id], d.sizeClass, `budgets.json classOf.${d.id}`);
  for (const c of ['small', 'medium', 'large']) assert.equal(B.maxTriangles[c], CLASS_CAPS[c].triangles, `cap ${c}`);
});

test('weight classes and caps', () => {
  assert.equal(weightOf('small'), 'light');
  assert.equal(weightOf('medium'), 'medium');
  assert.equal(weightOf('large'), 'heavy');
  assert.equal(weightOf('colossal'), 'heavy');
  assert.equal(weightOf(undefined), null);
  for (const c of SIZE_CLASSES) assert.ok(CLASS_CAPS[c].triangles > 0 && CLASS_CAPS[c].bones > 0, c);
  assert.deepEqual(SIZE_CLASSES.map((c) => CLASS_CAPS[c].triangles), [25000, 50000, 80000, 150000]);
});

const classOf = (k) => BIBLE[k] ?? null;
const roleOf = (k) => ({ plumb: 'sentry', transit: 'colossus' }[k] ?? null);
const at = (kind, x, z) => ({ kind, x, z });
const v = (list) => encounterVerdict(list, classOf, roleOf);
const FOUR = [at('screed', 0, 0), at('spindle', 8, 0), at('davit', -20, 0), at('plumb', 0, 30), at('peg', 10, 10)];

test('the encounter rule: one large + four medium or small within 60 m', () => {
  assert.equal(ENCOUNTER.radius, 60);
  assert.equal(ENCOUNTER.large.large, 1);
  assert.equal(ENCOUNTER.large.others, 4);
  assert.ok(v([...Array(6)].map((_, i) => at('tiller', i * 5, 0)).concat([...Array(6)].map((_, i) => at('peg', i, 9)))).ok, 'no large: not capped');
  assert.ok(v(FOUR).ok, 'one large + four');
  const r = v([...FOUR, at('peg', 12, 10)]);
  assert.ok(!r.ok && r.anchors[0].others === 5, 'a fifth within 60 m fails');
  assert.ok(v([...FOUR, at('peg', 61, 0)]).ok, 'the fifth at 61 m passes');
  const two = v([at('screed', 0, 0), at('kiln', 40, 0)]);
  assert.ok(!two.ok && two.anchors.length === 2 && two.anchors.every((a) => !a.ok), 'two large within 60 m fail at both');
  assert.ok(v([at('screed', 0, 0), at('kiln', 61, 0)]).ok, 'two large 61 m apart');
});

test('the encounter rule: the colossus + three sentries', () => {
  assert.ok(v([at('transit', 0, 0), at('plumb', 20, 0), at('plumb', -20, 0), at('plumb', 0, 20)]).ok);
  assert.ok(!v([at('transit', 0, 0), at('plumb', 20, 0), at('plumb', -20, 0), at('plumb', 0, 20), at('plumb', 0, -20)]).ok);
  assert.ok(!v([at('transit', 0, 0), at('peg', 20, 0)]).ok);
});

test('an unclassed kind is named, never counted', () => {
  const r = v([at('screed', 0, 0), at('mystery', 5, 0)]);
  assert.ok(r.ok);
  assert.equal(r.unclassed.join(), 'mystery');
  assert.equal(r.anchors[0].others, 0);
});

test('the spawn question (encounterAllows)', () => {
  assert.ok(!encounterAllows(FOUR, 'peg', 5, 5, classOf, roleOf).ok, 'a fifth other near the large');
  assert.ok(encounterAllows(FOUR, 'peg', 80, 0, classOf, roleOf).ok, '80 m off');
  assert.ok(!encounterAllows(FOUR, 'kiln', 30, 0, classOf, roleOf).ok, 'a second large');
  assert.ok(!encounterAllows([...Array(5)].map((_, i) => at('tiller', i * 5, 0)), 'screed', 10, 10, classOf, roleOf).ok, 'a large into five');
  assert.ok(encounterAllows([...Array(9)].map((_, i) => at('tiller', i * 5, 0)), 'tiller', 3, 3, classOf, roleOf).ok, 'no large anywhere');
});
