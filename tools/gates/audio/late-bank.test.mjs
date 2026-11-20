/**
 * The first-load cap's audio half (node --test; Tier 0 runs every *.test.mjs). No browser:
 *
 *   late-split        the manifest's load phases: every first-hour row (src/audio/m2/cues.js) is late except the Kit
 *                     Rack's UI clicks and the tells; every slice row is boot; DEFERRED_FILES is exactly the late rows' files, each on
 *                     disk; BOOT_BYTES + LATE_BYTES = BANK_BYTES
 *   late-tells        every tell is boot: each row marked `tell`, every set the attack table plays on a wind-up
 *                     (../../../src/audio/slice/director.js ATTACK_CUES) and the Screed's charge (a Continue at 'seal-1'
 *                     or 'seal-2' can hear it on its first frame of play, before any late row is fetched)
 *   boot-first        the boot load fetches the tells first (bank.load `first`: GameAudio passes the tell sets)
 *   late-ledger       the shipped ledger's deferred set (tools/tier0/budgets.mjs deferredFiles, read through
 *                     budgets.json shipped.deferred) is the manifest's list, file for file (one source of truth), plus
 *                     the Holds people the game streams by her distance (holds.js HOLDS_CAST less ids.js ARCHETYPE_IDS
 *                     and SLICE_CAST, the people staged at boot), and nothing else
 *   late-bank-order   SampleBank.load() fetches only boot rows; loadLate() fetches the late rows, the place she is in
 *                     first and its bed before its one-shots, a machine kind standing near her before both (lateRank:
 *                     a Continue at 'seal-1' fetches the Screed's rows first); an ask before a set's decode is a miss, one after it a lead
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
import { ATTACK_CUES } from '../../../src/audio/slice/director.js';
import { SampleBank, lateRank } from '../../../src/audio/bank.js';
import { deferredFiles, loadBudgets } from '../../tier0/budgets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('late-split: the first hour\'s rows load after control, the Kit Rack\'s and the slice\'s before', () => {
  const m2 = new Set(M2_CUES.map((c) => c.set));
  const wrong = [];
  for (const r of MANIFEST) {
    const want = m2.has(r.set) && !r.set.startsWith('rack/') && !M2_CUES.find((c) => c.set === r.set).tell ? 'late' : 'boot';
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

test('late-tells: every tell loads before control', () => {
  const boot = new Set(MANIFEST.filter((r) => r.load !== 'late').map((r) => r.set));
  const tells = new Set(M2_CUES.filter((c) => c.tell).map((c) => c.set));
  for (const v of Object.values(ATTACK_CUES)) {
    const pairs = Array.isArray(v[0]) ? v : [v];
    for (const [phase, set] of pairs) if (phase === 'windup') tells.add(set);
  }
  tells.add('screed/charge');
  const late = [...tells].filter((s) => !boot.has(s));
  assert.deepEqual(late, [], 'a tell in the late bank');
  for (const s of ['tiller/trample', 'screed/charge']) assert.ok(tells.has(s) && boot.has(s), `${s} is a boot tell`);
  for (const c of M2_CUES.filter((x) => x.tell)) assert.ok(MANIFEST.filter((r) => r.set === c.set).every((r) => r.tell === true), `${c.set}: the manifest marks the tell`);
  console.log(`# late-tells: ${tells.size} tells, all boot: ${[...tells].sort().join(', ')}`);
});

test('late-ledger: the ledger defers exactly the files the game loads late (the late bank) or streams (the Holds people)', async () => {
  const S = loadBudgets(ROOT).shipped;
  assert.ok(Array.isArray(S.deferred) && S.deferred.length > 0, 'budgets.json shipped.deferred names a module');
  assert.ok(!JSON.stringify(S.deferred).includes('.ogg'), 'no file list in budgets.json: the module is the list');
  const D = await deferredFiles(ROOT, S.deferred);
  assert.deepEqual(D.errors, []);
  const audio = [...D.files.keys()].filter((f) => f.startsWith('public/audio/'));
  assert.deepEqual(audio.sort(), DEFERRED_FILES.map((f) => `public/${f}`).sort());
  for (const f of audio) assert.equal(D.when.get(f), 'control', `${f}: the late bank's files are never fetched before control`);
  // the Holds people streamed by her distance: the cast's own GLBs less the archetypes the W1 group stages at boot
  const { HOLDS_CAST } = await import('../../../src/world/npc/people/holds.js');
  const { ARCHETYPE_IDS, SLICE_CAST } = await import('../../../src/world/npc/people/ids.js');
  // (M3 wave 2, area A: the smallest change here) and the Malpais' ground layers, fetched on the region's approach
  const { MALPAIS_FILES } = await import('../../../src/world/sites/malpais-files.js');
  const malpais = MALPAIS_FILES.map((f) => `public/${f}`);
  for (const f of malpais) assert.equal(D.when.get(f), 'region', `${f}: the Malpais' files are fetched by region`);
  const region = [...D.files.keys()].filter((f) => D.when.get(f) === 'region' && !malpais.includes(f)).sort();
  assert.deepEqual(region, HOLDS_CAST.filter((id) => !ARCHETYPE_IDS.includes(id) && !SLICE_CAST.includes(id)).map((id) => `public/models/npc/${id}.glb`).sort());
  assert.ok(!region.some((f) => /\/(pit-farmer|tiller-follower|cochineal-picker)\.glb$/.test(f)), 'a staged archetype is never deferred');
  assert.equal(D.files.size, audio.length + region.length + malpais.length, 'nothing else is deferred');
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

test('late-rank: a machine kind near her first, then her place, its beds before its one-shots', async () => {
  const row = (set, o = {}) => ({ id: set, set, file: `${set}.ogg`, bytes: 100, dur: 1, ch: 1, gain: 1, loop: false, tags: [], license: 'CC0-1.0', load: 'late', ...o });
  const man = [
    row('holds/hoe', { place: 'ninewalls' }),
    row('screed/stall', { place: 'ninewalls' }),
    row('amb/ninewalls', { place: 'ninewalls', loop: true, ch: 2 }),
    row('tiller/step', { place: 'holds' }),
    row('screed/idle', { place: 'ninewalls', loop: true }),
    row('amb/holds', { place: 'holds', loop: true, ch: 2 }),
  ];
  const S = standIn(man);
  try {
    await S.bank.load(S.ac);
    const where = { holds: 0, ninewalls: 0.2, scar: 0, malpais: 0 };
    await S.bank.loadLate(S.ac, { rank: (r) => lateRank(r, new Set(['screed']), (p) => where[p] ?? 0), concurrency: 1 });
    assert.deepEqual(S.fetched, ['screed/stall.ogg', 'screed/idle.ogg', 'amb/ninewalls.ogg', 'holds/hoe.ogg', 'amb/holds.ogg', 'tiller/step.ogg']);
  } finally { S.restore(); }
});

test('boot-first: the boot load fetches the tells before the rest', async () => {
  const row = (set, o = {}) => ({ id: set, set, file: `${set}.ogg`, bytes: 100, dur: 1, ch: 1, gain: 1, loop: false, tags: [], license: 'CC0-1.0', ...o });
  const man = [row('music/a'), row('foot/gravel'), row('screed/charge', { tell: true }), row('plumb/bob'), row('holds/hoe', { load: 'late', place: 'holds' })];
  const S = standIn(man);
  try {
    await S.bank.load(S.ac, { first: new Set(['screed/charge', 'plumb/bob']), concurrency: 1 });
    assert.deepEqual(S.fetched, ['screed/charge.ogg', 'plumb/bob.ogg', 'music/a.ogg', 'foot/gravel.ogg']);
  } finally { S.restore(); }
});
