// @ts-check
/**
 * W1 writing rows (browser-free).
 *
 *   node tools/gates/writing-w1.mjs [--tree <dir>] [--json]
 *
 * Reads src/game/text/** and checks the acceptance lines of BUILD item W1 that a machine can check:
 * the set is complete, no dialogue card is over three lines, no line is over the set's width, at least
 * half of Brea's turns carry a quantity or a bearing, and the strings the bible fixes word for word are
 * exactly those words. The name lint is its own tool (tools/tier0/namelint.mjs).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const ti = argv.indexOf('--tree');
const root = path.resolve(ti >= 0 ? argv[ti + 1] : '.');
const dir = path.join(root, 'src/game/text');
/** @param {string} rel */
const load = (rel) => JSON.parse(readFileSync(path.join(dir, rel), 'utf8'));

/** @type {{ id: string, pass: boolean, value: string }[]} */
const rows = [];
/** @param {string} id @param {boolean} pass @param {string} value */
const row = (id, pass, value) => rows.push({ id, pass, value });

const index = load('index.json');
const quest = load(index.files.quest);
const barks = load(index.files.barks);
const tutorial = load(index.files.tutorial);
const sighting = load(index.files.sighting);
const books = load(index.files.books);
const notices = load(index.files.notices);
const { lineMax, cardLinesMax, breaMeasureShare } = index.rules;

// A quantity or a bearing: a digit, a live placeholder, a number word, or one of Brea's field measures.
const NUMBER = /\d|\{bearing\}|\{n\}|\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|thirty|forty|sixty|eighty|hundred|half|quarter|twice|hands?|paces?|bearing)\b/i;

/** Every dialogue card: scenes, their stations, and Brea's own field turns. */
const dialogue = [];
for (const s of quest.scenes) {
  for (const c of s.cards) dialogue.push({ at: s.id, ...c });
  for (const st of s.stations || []) for (const c of st.cards) dialogue.push({ at: `${s.id}/${st.label}`, ...c });
}
const alone = quest.breaAlone.cards.map((/** @type {any} */ c) => ({ at: `alone/${c.on}`, who: 'brea', ...c }));
const allCards = [...dialogue, ...alone];

// 1. the set is complete
const want = { scenes: 2, barkSets: 8, books: 4, notices: 2, sighting: 2 };
const speakers = new Set(dialogue.map((c) => c.who));
const have = {
  ansel: speakers.has('ansel'), mise: speakers.has('mise'),
  barkSets: barks.sets.length, books: books.books.length, notices: notices.notices.length,
  sighting: sighting.cards.map((/** @type {any} */ c) => c.id).sort().join(','),
  fieldNotes: quest.stages.length, tutorial: tutorial.cards.length,
};
row('W1-complete',
  have.ansel && have.mise && have.barkSets === want.barkSets && have.books === want.books
    && have.notices === want.notices && have.sighting === 'gauge,plumb' && have.fieldNotes > 0 && have.tutorial > 0,
  `Ansel ${have.ansel}, Mise ${have.mise}, bark sets ${have.barkSets}/8, Field Books ${have.books}/4, Guild Notices ${have.notices}/2, Sighting cards ${have.sighting}, field notes ${have.fieldNotes}, tutorial cards ${have.tutorial}`);

// 2. no dialogue card over three lines
const tall = allCards.filter((c) => !Array.isArray(c.lines) || c.lines.length < 1 || c.lines.length > cardLinesMax);
const most = Math.max(...allCards.map((c) => c.lines.length));
row('W1-card-lines', tall.length === 0, `${allCards.length} dialogue cards, longest ${most} lines (cap ${cardLinesMax}); over: ${tall.map((c) => c.at).join(', ') || 'none'}`);

// 3. no line wider than the set's width (dialogue, barks, book pages, notice bodies)
/** @type {{ where: string, text: string }[]} */
const lines = [];
for (const c of allCards) for (const l of c.lines) lines.push({ where: c.at, text: l });
for (const s of barks.sets) for (const b of s.lines) for (const l of b) lines.push({ where: `bark/${s.id}`, text: l });
for (const b of books.books) for (const l of b.page) lines.push({ where: `book/${b.n}`, text: l });
for (const n of notices.notices) for (const l of n.body) lines.push({ where: `notice/${n.id}`, text: l });
const wide = lines.filter((l) => l.text.length > lineMax);
const widest = Math.max(...lines.map((l) => l.text.length));
row('W1-line-width', wide.length === 0, `${lines.length} lines, widest ${widest} characters (cap ${lineMax}); over: ${wide.map((l) => `${l.where} (${l.text.length})`).join(', ') || 'none'}`);

// 3b. barks are at most two lines; notice bodies at most three
const barkTall = barks.sets.flatMap((/** @type {any} */ s) => s.lines.filter((/** @type {string[]} */ b) => b.length > 2).map(() => s.id));
const barkShort = barks.sets.filter((/** @type {any} */ s) => s.lines.length < 5).map((/** @type {any} */ s) => s.id);
const noticeTall = notices.notices.filter((/** @type {any} */ n) => n.body.length > 3 || n.term !== 'untimed').map((/** @type {any} */ n) => n.id);
row('W1-barks-notices', barkTall.length === 0 && barkShort.length === 0 && noticeTall.length === 0,
  `bark lines ${barks.sets.reduce((/** @type {number} */ a, /** @type {any} */ s) => a + s.lines.length, 0)} in ${barks.sets.length} sets, each set >= 5 and each bark <= 2 lines; notices <= 3 lines and untimed; bad: ${[...barkTall, ...barkShort, ...noticeTall].join(', ') || 'none'}`);

// 4. Brea: at least half of her turns carry a quantity or a bearing
/** @param {any[]} cards */
const share = (cards) => {
  const hers = cards.filter((c) => c.who === 'brea');
  const marked = hers.filter((c) => c.measure === true);
  const hollow = marked.filter((c) => !NUMBER.test(c.lines.join(' ')));   // marked, but no number in it
  const unmarked = hers.filter((c) => c.measure !== true && /\d|\{bearing\}/.test(c.lines.join(' ')));
  return { n: hers.length, m: marked.length - hollow.length, hollow, unmarked };
};
const d = share(dialogue);
const a = share(alone);
const t = share(allCards);
const pct = (/** @type {{n:number,m:number}} */ s) => `${s.m}/${s.n} = ${(100 * s.m / s.n).toFixed(0)} %`;
row('W1-brea-measure',
  d.m / d.n >= breaMeasureShare && a.m / a.n >= breaMeasureShare && d.hollow.length + a.hollow.length === 0,
  `in dialogue ${pct(d)}; alone in the field ${pct(a)}; all her turns ${pct(t)} (bar ${breaMeasureShare * 100} %); marked without a number: ${[...d.hollow, ...a.hollow].map((c) => c.at).join(', ') || 'none'}`);

// 5. the words the bible fixes
const tut = Object.fromEntries(tutorial.cards.map((/** @type {any} */ c) => [c.id, c.head ? `${c.head} · ${c.body}` : c.body]));
const fixed = [
  ['first field note', `${quest.kicker} · ${quest.title} · ${quest.stages[0].note}`, "FIELD NOTE · RAKER'S MORNING · Rake the third pan with Matron Ansel"],
  ['Gauge card', sighting.cards.find((/** @type {any} */ c) => c.id === 'gauge').line, 'GAUGE · SLUICE 3 · TIDE 0.4 m'],
  ['MAKE card', tut.make, 'MAKE · hold a quick slot to make six'],
  ['reed card', tut.reeds, 'REEDS HIDE YOU WHILE THE WIND MOVES THEM'],
  ['BRAZIER card', tut.brazier, 'BRAZIER · rest to choose the light. Resting saves.'],
];
const off = fixed.filter(([, got, exp]) => got !== exp);
row('W1-fixed-words', off.length === 0, `${fixed.length - off.length}/${fixed.length} bible-fixed strings exact; off: ${off.map(([k]) => k).join(', ') || 'none'}`);

// 6. words held for later sets: Oro's line belongs to W2 and appears there once, so not here
const everything = JSON.stringify([quest, barks, tutorial, sighting, books, notices]);
const held = ['It will send another', 'It is not angry'].filter((s) => everything.includes(s));
row('W1-held-lines', held.length === 0, `lines held for W2 present here: ${held.join(' | ') || 'none'}`);

if (argv.includes('--json')) console.log(JSON.stringify({ tree: root, rows }, null, 2));
else for (const r of rows) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id}: ${r.value}`);
process.exit(rows.every((r) => r.pass) ? 0 : 1);
