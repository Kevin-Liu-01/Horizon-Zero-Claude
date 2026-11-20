// W3, the writing for hour two (Milestone 3 wave 3, area E; BUILD W3 "as W1"; the brief's HT9): the three quests' lines,
// Nesra's first mention (once, by Ansel, in the kite quest), Field Books 11-18, the kite's, the Yards' and the held
// rung's cards, every line under W1's bars (src/game/text/index.json `rules`). Each quest's stage ids are its beats in
// the hour-two run (./plan.js), and its strings make a QuestSpine. The name lint is its own tool (tools/tier0/namelint.mjs).
// Browser-free: node --test src/game/hour2/writing-w3.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BEATS, GLASS_LINE_ID, WRONG_TIDE_ID, KILN_YARDS_ID } from './plan.js';
import { KILN_YARDS_STAGES, KILN_YARDS_REWARD } from './kiln-yards-plan.js';
import { QuestSpine } from '../quest/spine.js';
import { makeStrings } from '../strings.js';

const DIR = fileURLToPath(new URL('../text/', import.meta.url));
const load = (rel) => JSON.parse(readFileSync(DIR + rel, 'utf8'));
const raw = (rel) => readFileSync(DIR + rel, 'utf8');
const index = load('index.json');
const W3 = index.w3.files;
const quests = Object.fromEntries(W3.quests.map((f) => { const q = load(f); return [q.id, q]; }));
const cards = load(W3.tutorial), books = load(W3.books);
const { lineMax, cardLinesMax, breaMeasureShare } = index.rules;
// W1's own measure (tools/gates/writing-w1.mjs, W2's copy): a digit, a live placeholder, a number word, a field measure
const NUMBER = /\d|\{bearing\}|\{n\}|\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|thirty|forty|sixty|eighty|hundred|half|quarter|twice|hands?|paces?|bearing|metres?)\b/i;

const dialogue = [], alone = [];
for (const q of Object.values(quests)) {
  for (const s of q.scenes) for (const c of s.cards) dialogue.push({ at: `${q.id}/${s.id}`, q: q.id, ...c });
  for (const c of q.breaAlone.cards) alone.push({ at: `${q.id}/alone/${c.on}`, q: q.id, who: 'brea', ...c });
}
const allCards = [...dialogue, ...alone];

test('W3 is complete: three quests whose stages are their beats, 8 Field Books (11-18), the three cards', () => {
  const beatIds = (qid) => BEATS.filter((b) => b.quest === qid).map((b) => b.id);
  assert.deepEqual(Object.keys(quests).sort(), [GLASS_LINE_ID, KILN_YARDS_ID, WRONG_TIDE_ID].sort());
  for (const qid of [GLASS_LINE_ID, WRONG_TIDE_ID, KILN_YARDS_ID]) assert.deepEqual(quests[qid].stages.map((s) => s.id), beatIds(qid), `${qid}'s stages are its beats`);
  assert.deepEqual(quests[KILN_YARDS_ID].stages.map((s) => s.id), KILN_YARDS_STAGES.map((s) => s.id));
  assert.equal(books.books.length, 8);
  assert.deepEqual(books.books.map((b) => b.n), [11, 12, 13, 14, 15, 16, 17, 18]);
  for (const b of books.books) {
    assert.ok(b.inks && b.inks.kind && b.inks.what, `book ${b.n} inks exactly one mark`);
    assert.ok(Array.isArray(b.page) && b.page.length >= 6, `book ${b.n} has a page`);
    assert.ok(b.place && b.sketch && b.loading, `book ${b.n}: place, sketch, loading`);
  }
  assert.deepEqual(cards.cards.map((c) => c.id).sort(), ['kite', 'rung-held', 'yards']);
  // every speaker is one index.json knows
  for (const c of dialogue) assert.ok(index.speakers[c.who], `${c.at}: speaker ${c.who}`);
});

test('every quest\'s strings make a QuestSpine (every stage has its text; every card a stage names exists)', () => {
  const text = { index, quest: null, tutorial: load(index.files.tutorial), sighting: load(index.files.sighting), barks: load(index.files.barks), systems: load('ui/systems.json') };
  for (const q of Object.values(quests)) {
    const S = makeStrings({ ...text, quest: q, extraCards: [...load(index.w2.files.tutorial).cards, ...cards.cards], extraSighting: [] });
    for (const s of q.stages) assert.ok(S.stage(s.id)?.note && S.stage(s.id)?.log, `${q.id}/${s.id}`);
    if (q.id === KILN_YARDS_ID) {
      assert.doesNotThrow(() => new QuestSpine({ strings: S, id: q.id, stages: KILN_YARDS_STAGES, reward: KILN_YARDS_REWARD, triangles: {}, closingCard: null }));
      for (const st of KILN_YARDS_STAGES) {
        for (const c of st.cards || []) assert.ok(S.card(c), `${st.id}: card ${c}`);
        for (const on of Object.values(st.turns || {})) assert.ok(S.turn(on), `${st.id}: turn ${on}`);
        if (st.scene) assert.ok(S.scene(st.scene), `${st.id}: scene ${st.scene}`);
      }
    }
  }
});

test(`no dialogue card over ${cardLinesMax} lines; no line over ${lineMax} characters (cards, notes, logs, books)`, () => {
  const tall = allCards.filter((c) => !Array.isArray(c.lines) || c.lines.length < 1 || c.lines.length > cardLinesMax);
  assert.deepEqual(tall.map((c) => c.at), []);
  const lines = [];
  for (const c of allCards) for (const l of c.lines) lines.push([c.at, l]);
  for (const q of Object.values(quests)) {
    for (const s of q.stages) { lines.push([`${q.id}/${s.id}/note`, s.note]); lines.push([`${q.id}/${s.id}/log`, s.log]); }
    lines.push([`${q.id}/closing`, q.closing.note], [`${q.id}/logEnd`, q.closing.logEnd], ...q.closing.reward.map((r) => [`${q.id}/reward`, r]));
  }
  for (const b of books.books) for (const l of b.page) lines.push([`book/${b.n}`, l]);
  const wide = lines.filter(([, l]) => l.length > lineMax);
  assert.deepEqual(wide, [], `${lines.length} lines; widest ${Math.max(...lines.map(([, l]) => l.length))}`);
  assert.ok(lines.length > 150);
});

test(`at least ${breaMeasureShare * 100} % of Brea's turns carry a quantity or a bearing (in dialogue and alone), and every marked one does`, () => {
  const share = (cs) => {
    const hers = cs.filter((c) => c.who === 'brea'), marked = hers.filter((c) => c.measure === true);
    const hollow = marked.filter((c) => !NUMBER.test(c.lines.join(' ')));
    return { n: hers.length, m: marked.length - hollow.length, hollow: hollow.map((c) => c.at) };
  };
  for (const [name, cs] of [['dialogue', dialogue], ['alone', alone]]) {
    const s = share(cs);
    assert.deepEqual(s.hollow, [], `${name}: marked without a number`);
    assert.ok(s.m / s.n >= breaMeasureShare, `${name}: ${s.m}/${s.n}`);
  }
});

test('Nesra\'s first mention: exactly once in all the writing (W1, W2, W3), said by Ansel, in "A Line Over the Glass"', () => {
  const files = [
    ...Object.values(index.files), 'ui/systems.json',
    ...index.w2.files.quests, index.w2.files.barks, index.w2.files.tutorial, index.w2.files.sighting, index.w2.files.books, index.w2.files.notices,
    ...W3.quests, W3.tutorial, W3.books,
  ];
  const all = [...new Set(files)].map(raw).join('\n');
  assert.equal(all.split('Nesra').length - 1, 1);
  const said = dialogue.filter((c) => c.lines.join(' ').includes('Nesra'));
  assert.equal(said.length, 1);
  assert.equal(said[0].who, 'ansel');
  assert.equal(said[0].q, GLASS_LINE_ID);
});

test('the Kiln Yards\' reward card says rung 7 is held at Oro\'s while rung 6 is not owned; the held card says so too', () => {
  const ky = quests[KILN_YARDS_ID];
  assert.equal(ky.closing.reward[0], 'RUNG 7 · ARCANE · HELD AT ORO\'S');
  assert.match(ky.closing.reward[1], /RUNG 6/);
  assert.ok(Array.isArray(ky.closing.rewardMade) && ky.closing.rewardMade.length >= 1);
  const held = cards.cards.find((c) => c.id === 'rung-held');
  assert.match(held.body, /Oro's/); assert.match(held.body, /rung 6/);
  // the kite and the Yards' cards carry their rules' numbers (5:1; 3 m)
  assert.match(cards.cards.find((c) => c.id === 'kite').body, /5 m on for 1 m down/);
  assert.match(cards.cards.find((c) => c.id === 'yards').body, /3 m/);
});
