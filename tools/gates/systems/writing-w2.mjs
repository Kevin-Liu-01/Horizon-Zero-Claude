// @ts-check
/**
 * W2 writing rows (HR9; browser-free): the rest of the first hour's words, by W1's rules (src/game/text/index.json
 * `rules`; tools/gates/writing-w1.mjs is W1's own check and is unchanged).
 *
 *   node tools/gates/systems/writing-w2.mjs [--tree <dir>] [--json]
 *
 * Reads index.json's `w2` block and checks: the set is complete ("The Scar", "True Ground", Oro, 8 Holds bark sets,
 * 6 Field Books, 4 Guild Notices, the Transit card); no dialogue card over three lines; no line over the set's width;
 * barks at most two lines and sets of five or more; notices at most three lines and untimed; at least half of Brea's
 * turns carry a quantity or a bearing (in dialogue and alone, each); the words the bible fixes are exactly those words;
 * Oro's "It will send another" line appears exactly once in all the writing (W1 and W2). The name lint is its own tool
 * (tools/tier0/namelint.mjs).
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
const W = index.w2.files;
/** @type {Record<string, any>} */
const quests = Object.fromEntries(W.quests.map((/** @type {string} */ f) => { const q = load(f); return [q.id, q]; }));
const barks = load(W.barks), tutorial = load(W.tutorial), sighting = load(W.sighting), books = load(W.books), notices = load(W.notices);
const { lineMax, cardLinesMax, breaMeasureShare } = index.rules;
// W1's own measure (tools/gates/writing-w1.mjs): a digit, a live placeholder, a number word, or one of Brea's field measures
const NUMBER = /\d|\{bearing\}|\{n\}|\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|thirty|forty|sixty|eighty|hundred|half|quarter|twice|hands?|paces?|bearing)\b/i;

const dialogue = [], alone = [];
for (const q of Object.values(quests)) {
  for (const s of q.scenes) {
    for (const c of s.cards) dialogue.push({ at: `${q.id}/${s.id}`, ...c });
    for (const st of s.stations || []) for (const c of st.cards) dialogue.push({ at: `${q.id}/${s.id}/${st.label}`, ...c });
  }
  for (const c of q.breaAlone.cards) alone.push({ at: `${q.id}/alone/${c.on}`, who: 'brea', ...c });
}
const allCards = [...dialogue, ...alone];

// 1. the set is complete
const speakers = new Set(dialogue.map((c) => c.who));
const have = {
  scar: !!quests['the-scar'], trueGround: !!quests['true-ground'], oro: speakers.has('oro') && !!index.speakers.oro,
  barkSets: barks.sets.length, books: books.books.length, notices: notices.notices.length,
  transit: sighting.cards.some((/** @type {any} */ c) => c.id === 'transit'),
  stages: Object.values(quests).reduce((a, q) => a + q.stages.length, 0),
};
row('W2-complete', have.scar && have.trueGround && have.oro && have.barkSets === 8 && have.books === 6 && have.notices === 4 && have.transit && have.stages === 14,
  `The Scar ${have.scar}, True Ground ${have.trueGround}, Oro speaks ${have.oro}, Holds bark sets ${have.barkSets}/8, Field Books ${have.books}/6, Guild Notices ${have.notices}/4, the Transit card ${have.transit}, field notes ${have.stages}/14, tutorial cards ${tutorial.cards.length}`);

// 2. no dialogue card over three lines
const tall = allCards.filter((c) => !Array.isArray(c.lines) || c.lines.length < 1 || c.lines.length > cardLinesMax);
row('W2-card-lines', tall.length === 0, `${allCards.length} dialogue cards (${dialogue.length} in scenes, ${alone.length} of Brea alone), longest ${Math.max(...allCards.map((c) => c.lines.length))} lines (cap ${cardLinesMax}); over: ${tall.map((c) => c.at).join(', ') || 'none'}`);

// 3. no line wider than the set's width
/** @type {{ where: string, text: string }[]} */
const lines = [];
for (const c of allCards) for (const l of c.lines) lines.push({ where: c.at, text: l });
for (const s of barks.sets) for (const b of s.lines) for (const l of b) lines.push({ where: `bark/${s.id}`, text: l });
for (const b of books.books) for (const l of b.page) lines.push({ where: `book/${b.n}`, text: l });
for (const n of notices.notices) for (const l of n.body) lines.push({ where: `notice/${n.id}`, text: l });
const wide = lines.filter((l) => l.text.length > lineMax);
row('W2-line-width', wide.length === 0, `${lines.length} lines, widest ${Math.max(...lines.map((l) => l.text.length))} characters (cap ${lineMax}); over: ${wide.map((l) => `${l.where} (${l.text.length})`).join(', ') || 'none'}`);

// 3b. barks and notices
const barkTall = barks.sets.flatMap((/** @type {any} */ s) => s.lines.filter((/** @type {string[]} */ b) => b.length > 2).map(() => s.id));
const barkShort = barks.sets.filter((/** @type {any} */ s) => s.lines.length < 5).map((/** @type {any} */ s) => s.id);
const noticeTall = notices.notices.filter((/** @type {any} */ n) => n.body.length > 3 || n.term !== 'untimed').map((/** @type {any} */ n) => n.id);
row('W2-barks-notices', barkTall.length + barkShort.length + noticeTall.length === 0,
  `bark lines ${barks.sets.reduce((/** @type {number} */ a, /** @type {any} */ s) => a + s.lines.length, 0)} in ${barks.sets.length} sets (each >= 5, each bark <= 2 lines); ${notices.notices.length} notices <= 3 lines and untimed; bad: ${[...barkTall, ...barkShort, ...noticeTall].join(', ') || 'none'}`);

// 4. Brea's quantities or bearings in half her turns
/** @param {any[]} cards */
const share = (cards) => {
  const hers = cards.filter((c) => c.who === 'brea');
  const marked = hers.filter((c) => c.measure === true);
  const hollow = marked.filter((c) => !NUMBER.test(c.lines.join(' ')));
  return { n: hers.length, m: marked.length - hollow.length, hollow };
};
const d = share(dialogue), a = share(alone), t = share(allCards);
const pct = (/** @type {{n:number,m:number}} */ s) => `${s.m}/${s.n} = ${(100 * s.m / Math.max(1, s.n)).toFixed(0)} %`;
row('W2-brea-measure', d.m / d.n >= breaMeasureShare && a.m / a.n >= breaMeasureShare && d.hollow.length + a.hollow.length === 0,
  `in dialogue ${pct(d)}; alone in the field ${pct(a)}; all her turns ${pct(t)} (bar ${breaMeasureShare * 100} %); marked without a number: ${[...d.hollow, ...a.hollow].map((c) => c.at).join(', ') || 'none'}`);

// 5. the words the bible fixes
const scar = quests['the-scar'], tg = quests['true-ground'];
const oroCards = dialogue.filter((c) => c.who === 'oro').map((c) => c.lines.join(' '));
const transit = sighting.cards.find((/** @type {any} */ c) => c.id === 'transit');
const titles = notices.notices.map((/** @type {any} */ n) => n.title);
const fixed = [
  ["Oro's line", oroCards.find((l) => l.startsWith('It will send another')) ?? '', 'It will send another. It is not angry. The wall is not on its map.'],
  ['the Transit card', transit?.line ?? '', 'TRANSIT · BASELINE · STATION 1 OF 9'],
  ['the Scar\'s first field note', `${scar.kicker} · ${scar.title} · ${scar.stages[0].note}`, 'FIELD NOTE · THE SCAR · Take the road up into the Crescent Holds'],
  ['the travel words', tg.closing.reward[0], 'WALK THE LINE TO BENCHMARK 1'],
  ['notice: the Sickle blade', titles.find((/** @type {string} */ x) => /SICKLE/.test(x)) ?? '', 'BRING BACK AN UNBROKEN SICKLE BLADE'],
  ['notice: the Scar', titles.find((/** @type {string} */ x) => /SCAR/.test(x)) ?? '', 'WALK THE SCAR END TO END UNSEEN'],
];
const off = fixed.filter(([, got, exp]) => got !== exp);
row('W2-fixed-words', off.length === 0, `${fixed.length - off.length}/${fixed.length} bible-fixed strings exact; off: ${off.map(([k, got]) => `${k} (${got})`).join(', ') || 'none'}`);

// 6. "It will send another" exactly once in all the writing, and said by Oro
const w1 = ['quests/rakers-morning.json', index.files.barks, index.files.tutorial, index.files.sighting, index.files.books, index.files.notices].map((f) => readFileSync(path.join(dir, f), 'utf8')).join('\n');
const w2 = [...W.quests, W.barks, W.tutorial, W.sighting, W.books, W.notices].map((f) => readFileSync(path.join(dir, f), 'utf8')).join('\n');
const count = (/** @type {string} */ s) => s.split('It will send another').length - 1;
row('W2-oro-once', count(w1) === 0 && count(w2) === 1 && oroCards.filter((l) => l.includes('It will send another')).length === 1,
  `"It will send another" in W1 ${count(w1)} times, in W2 ${count(w2)} times (bar: 0 and 1, said by Oro)`);

if (argv.includes('--json')) console.log(JSON.stringify({ tree: root, rows }, null, 2));
else for (const r of rows) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id}: ${r.value}`);
process.exit(rows.every((r) => r.pass) ? 0 : 1);
