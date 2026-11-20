/**
 * The first-load cap's audio half (node --test; Tier 0 runs every *.test.mjs). No browser:
 *
 *   late-split        the manifest's load phases: every first-hour row (src/audio/m2/cues.js) is late except the Kit
 *                     Rack's UI clicks; every slice row is boot; DEFERRED_FILES is exactly the late rows' files, each on
 *                     disk; BOOT_BYTES + LATE_BYTES = BANK_BYTES
 *   late-ledger       the shipped ledger's deferred set (tools/tier0/budgets.mjs deferredFiles, read through
 *                     budgets.json shipped.deferred) is the manifest's list, file for file: one source of truth
 *   late-bank-order   SampleBank.load() fetches only boot rows; loadLate() fetches the late rows, the place she is in
 *                     first and its bed before its one-shots; an ask before a set's decode is a miss, one after it a lead
 *
 * What the built game really fetches before control is measured in Chrome by tools/perf/boot-transfer.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST, DEFERRED_FILES, LATE_SETS, BOOT_BYTES, LATE_BYTES, BANK_BYTES } from '../../../src/audio/manifest.js';
import { M2_CUES } from '../../../src/audio/m2/cues.js';
import { SampleBank } from '../../../src/audio/bank.js';
import { deferredFiles, loadBudgets } from '../../tier0/budgets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('late-split: the first hour\'s rows load after control, the Kit Rack\'s and the slice\'s before', () => {
  const m2 = new Set(M2_CUES.map((c) => c.set));
  const wrong = [];
  for (const r of MANIFEST) {
    const want = m2.has(r.set) && !r.set.startsWith('rack/') ? 'late' : 'boot';
    const got = r.load === 'late' ? 'late' : 'boot';
    if (want !== got) wrong.push(`${r.id}: ${got}, want ${want}`);
    if (got === 'late') assert.ok(['holds', 'ninewalls', 'scar', 'malpais'].includes(r.place), `${r.id}: a late row names its place (${r.place})`);
  }
  assert.deepEqual(wrong, []);
  const late = MANIFEST.filter((r) => r.load === 'late');
  assert.deepEqual([...DEFERRED_FILES].sort(), late.map((r) => `audio/${r.file}`).sort());
  for (const f of DEFERRED_FILES) {
    const abs = path.join(ROOT, 'public', f);
    assert.ok(existsSync(abs), `${f} on disk`);
    assert.equal(statSync(abs).size, MANIFEST.find((r) => `audio/${r.file}` === f).bytes, `${f}: the manifest's bytes`);
  }
  assert.equal(BOOT_BYTES + LATE_BYTES, BANK_BYTES);
  assert.equal(LATE_SETS.size, new Set(late.map((r) => r.set)).size);
  console.log(`# late-split: boot ${(BOOT_BYTES / 1048576).toFixed(3)} MB in ${MANIFEST.length - late.length} files; late ${(LATE_BYTES / 1048576).toFixed(3)} MB in ${late.length} files (${LATE_SETS.size} sets)`);
});

test('late-ledger: the ledger defers exactly the files the game loads late', async () => {
  const S = loadBudgets(ROOT).shipped;
  assert.ok(Array.isArray(S.deferred) && S.deferred.length > 0, 'budgets.json shipped.deferred names a module');
  assert.ok(!JSON.stringify(S.deferred).includes('.ogg'), 'no file list in budgets.json: the module is the list');
  const D = await deferredFiles(ROOT, S.deferred);
  assert.deepEqual(D.errors, []);
  assert.deepEqual([...D.files.keys()].sort(), DEFERRED_FILES.map((f) => `public/${f}`).sort());
  const raw = readFileSync(path.join(ROOT, 'tools/tier0/budgets.mjs'), 'utf8');
  assert.ok(!/audio\/(holds|screed|forge|tiller)\//.test(raw), 'the ledger names no audio file itself');
});

/** A stand-in AudioContext and fetch: decode resolves with a buffer named by its file; every fetch is logged. */
function standIn(manifest) {
  const fetched = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    fetched.push(String(url).replace('/audio/', ''));
    await new Promise((r) => setTimeout(r, 1));
    return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(100) };
  };
  const ac = { decodeAudioData: async () => ({ duration: 1 }) };
  const bank = new SampleBank(manifest, manifest.reduce((m, e) => { (m[e.set] ||= []).push(e); return m; }, {}), '/audio/');
  return { bank, ac, fetched, restore: () => { globalThis.fetch = realFetch; } };
}

test('late-bank-order: boot rows before control; late rows after it, her place and its bed first; asks logged', async () => {
  const row = (set, o = {}) => ({ id: set, set, file: `${set}.ogg`, bytes: 100, dur: 1, ch: 1, gain: 1, loop: false, tags: [], license: 'CC0-1.0', ...o });
  const man = [
    row('foot/gravel'), row('ui/tick'),
    row('holds/hoe', { load: 'late', place: 'holds' }),
    row('screed/cut', { load: 'late', place: 'ninewalls' }),
    row('amb/ninewalls', { load: 'late', place: 'ninewalls', loop: true, ch: 2 }),
    row('amb/scar', { load: 'late', place: 'scar', loop: true, ch: 2 }),
  ];
  const S = standIn(man);
  try {
    await S.bank.load(S.ac);
    assert.deepEqual(S.fetched.sort(), ['foot/gravel.ogg', 'ui/tick.ogg'], 'the boot phase fetches no late row');
    assert.equal(S.bank.late.state, 'waiting');
    // an ask before the late load: a miss
    assert.equal(S.bank.pick('screed/cut'), null);
    S.fetched.length = 0;
    const where = { holds: 0.5, ninewalls: 1, scar: 0, malpais: 0 };
    const rank = (r) => (1 - where[r.place]) * 10 + (r.loop && r.ch === 2 ? 0 : 1);
    await S.bank.loadLate(S.ac, { rank, concurrency: 1, controlAt: performance.now() });
    assert.deepEqual(S.fetched, ['amb/ninewalls.ogg', 'screed/cut.ogg', 'holds/hoe.ogg', 'amb/scar.ogg'], 'her place first, its bed before its one-shots');
    assert.ok(S.bank.pick('holds/hoe'));
    S.bank.noteAsk('amb/ninewalls');
    S.bank.noteAsk('foot/gravel');      // a boot set: not logged
    const A = S.bank.lateAudit();
    assert.equal(A.state, 'done');
    assert.equal(A.decoded, 4);
    assert.deepEqual(A.missed.map((m) => m.set), ['screed/cut']);
    assert.equal(A.asked, 3);
    const hoe = A.sets.find((x) => x.set === 'holds/hoe');
    assert.ok(hoe.leadS >= 0 && hoe.misses === 0);
    assert.equal(S.bank.audit().late.missed, 1);
  } finally { S.restore(); }
});
