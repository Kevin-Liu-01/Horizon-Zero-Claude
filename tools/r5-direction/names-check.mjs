// Round 5, direction B: check every proposed name against Horizon (HZD, Frozen Wilds,
// HFW, Burning Shores, Call of the Mountain) terms, plus Sony marks we must not echo.
//
//   node tools/r5-direction/names-check.mjs        -> table + exit 1 on any HIT
//
// Rules (case-insensitive, after stripping spaces/hyphens/apostrophes):
//   HIT    exact match, or one name contains the other (both >= 4 chars)
//   ROOT   our name contains a Horizon compound root (e.g. -jaw, -claw, -back) as a word part
//   NEAR   edit distance <= 2 on words >= 5 chars (sound-alikes worth a human look)
// The Horizon list is from memory of the shipped games plus ROUND5-INVENTORY §3; extend it,
// do not shrink it. A clean run is necessary, not sufficient: trademark search before release.

// single-token Horizon names (people, tribes, places, machines, items, mechanics)
const HORIZON = `
Horizon Guerrilla Sony PlayStation Concord Uncharted
Aloy Rost Varl Sona Teb Vala Teersa Lansra Jezza Bast Karst Olin Nil Sylens Erend Ersa Avad Petra Talanah Janeva Dervahl Helis Hades Gaia
Hephaestus Apollo Minerva Aether Poseidon Demeter Artemis Eleuthia Cyan Sobeck Elisabet Faro Zenith Tilda Kotallo Alva Zo Beta Regalla Hekarro
Morlund Dekka Arokkeh Yarra Drakka Seyka Londra Ourea Aratak Werak Kulrut Ulvund Lowell Kina Delah Abadund Gerrit Vanasha Itamen Marad Nakoa
Nora Carja Oseram Banuk Utaru Tenakth Quen Zeniths Eclipse Derangement Corruption Corrupted Blight
Meridian Daunt Sunfall Sunstone Embrace Chainscrape Pitchcliff Plainsong Thornmarsh Lowland Grave-Hoard Raintrace Stillsands Arrowhand Saltbite
Cauldron Proving Brave Prowler Forager
Watcher Strider Grazer Broadhead Charger Lancehorn Trampler Longleg Scrapper Glinthawk Stormbird Sawtooth Ravager Snapmaw Shell-Walker Stalker
Behemoth Rockbreaker Fireclaw Frostclaw Thunderjaw Deathbringer Corruptor Tallneck Bellowback Scorcher Redeye Horus Burrower Fanghorn Bristleback
Plowhorn Skydrifter Clamberjaw Widemaw Leaplasher Sunwing Rollerback Clawstrider Shellsnapper Spikesnout Slitherfang Tideripper Slaughterspine
Dreadwing Tremortusk Specter Scrounger Bileguts Waterwing Stingspawn Apex Chariot Grimhorn
Focus Override Concentration Datapoint Resonator Shards Blaze Chillwater Sparker Ridge-wood Circulator Pullcaster Shieldwing Igniter Tearblast
Ropecaster Tripcaster Sharpshot Rattler Boltblaster Icerail Firespitter Stormslinger Forgefire Purgewater Hardpoint Tinker Seeker Sun-King Sun-Priest
Matriarch All-Mother
`;
// multi-word Horizon names: matched as whole word sequences, never split into generic words
const MULTI = ['Zero Dawn', 'Forbidden West', 'Frozen Wilds', 'Burning Shores', 'Call of the Mountain', "Mother's Heart", "Mother's Watch",
  "Mother's Crown", 'Sacred Lands', 'Scalding Spear', 'Barren Light', "Devil's Thirst", 'Clan Lands', "No Man's Land", 'Isle of Spires',
  'Free Heart', "Legacy's Landfall", "Fall's Edge", 'Bleeding Mark', 'Maw of the Arena', 'Hidden Ember', 'Hunting Grounds', "Hunter's Lodge",
  'Metal Devil', 'Old Ones', 'Faro Plague', 'Valor Surge', 'Silent Strike', 'Critical Strike', 'Medicine Pouch', 'Metal Shards', 'Braided Wire',
  'Machine Core', 'Sac Webbing', 'Diving Mask', 'Blast Sling', 'Spike Thrower', 'Shredder Gauntlet', 'Warrior Bow', 'Hunter Bow', 'War Bow',
  'Shadow Carja', 'Heart-o-the-Mother', 'The Cut', 'Far Zenith', 'Ted Faro'];
// plain English words we use on purpose; inside a Horizon compound they are GENERIC, not HIT
const GENERIC = new Set(['salt', 'burn', 'arc', 'pry', 'kite', 'kiln', 'weir', 'plan', 'lamp', 'hull', 'comb', 'pan', 'tiles', 'steady', 'impact', 'mark', 'flag']);

const ROOTS = ['jaw', 'claw', 'maw', 'tooth', 'neck', 'horn', 'wing', 'hawk', 'strider', 'walker', 'back', 'snout', 'fang', 'spine', 'tusk', 'drifter', 'lasher', 'snapper', 'caster', 'bird'];

const OURS = {
  title: ['Unbuilt', 'The Sounding Coast', 'Claude'],
  people: ['Isa Brack', 'Brack', 'Ode Fenn', 'Hesk', 'First Assessor', 'Netfolk', 'Salters', 'Assessors', 'Linewalker', 'Chainman'],
  places: ['Comb', 'Whitecut', 'Glazeworks', 'Black Strand', 'The Pan', 'Organ Shelf', 'Lagoons', 'Footings', 'Sounding Ring', 'The Hull',
    'The Lamp', 'First Arch', 'Datum', 'Bottle Kilns', 'Tessera', 'Charter', 'The Plan', 'Drowned Rooms', 'Plan Table', 'Beacon', 'Kiln Mound',
    'Stake Line', 'Tally Board', 'Wreck Cache', 'Net-knot', 'Brine Ponds', 'Dune Sea'],
  works: ['The Works', 'Tiller', 'Plumb', 'Picket', 'Shear', 'Harrow', 'Kiln', 'Winch', 'Weir', 'Sounder', 'Kite', 'Spindle', 'Gantry'],
  mechanics: ['Sightglass', 'Sighting', 'Steady', 'Impact', 'Pry', 'Burn', 'Arc', 'Salt', 'Flagged', 'Undercut', 'Felling Blow', 'Dew Flask', 'Tiles', 'Haar', 'Blinded', 'Pinned', 'Brittle'],
  weapons: ['Ranging Bow', 'Fieldbow', 'Longsight', 'Kilnbow', 'Ranging Rod', 'Billhook', 'Plumb Maul', 'Stakedriver', 'Twin-driver', 'Piledriver',
    'Gaff', 'Grapnel', 'Conductor Gaff', 'Kiln Pots', 'Oil Pot', 'Brine Pot', 'Haar Pot', 'Lantern Buckler', 'Bell Buckler', 'Mirror Buckler',
    'Bodkin', 'Prybarb', 'Oilhead', 'Coilhead', 'Brinehead', 'Sounding Arrow'],
  armor: ['Haar Coat', 'Lampblack', 'Dune Coat', 'Sherdmail', 'Glazed Kilnplate', 'Bellguard', "Chainman's Harness", 'Plumbline Harness',
    "Stakeman's Harness", 'Saltward', 'Arcward', 'Ashward'],
};

const norm = (s) => s.toLowerCase().replace(/[\s'\-]/g, '');
const wordsOf = (s) => s.toLowerCase().replace(/^the /, '').split(/[\s\-]+/).map(norm).filter(Boolean);
const terms = new Set(HORIZON.split(/\s+/).filter((w) => w.length >= 3).map(norm));
const phrases = MULTI.map(wordsOf);

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const seqIn = (needle, hay) => { // contiguous word subsequence
  for (let i = 0; i + needle.length <= hay.length; i++) if (needle.every((w, k) => hay[i + k] === w)) return true;
  return false;
};

const rows = [];
let hits = 0;
for (const [group, names] of Object.entries(OURS)) for (const name of names) {
  const n = norm(name.replace(/^the /i, ''));
  const words = wordsOf(name);
  const found = [];
  for (const t of terms) {
    if (t === n) found.push(`HIT =${t}`);
    else if (t.length >= 4 && n.length >= 4 && (n.includes(t) || t.includes(n))) {
      found.push(GENERIC.has(n) && t.includes(n) ? `GENERIC in ${t}` : `HIT ~${t}`);
    }
    for (const w of words) if (w !== n && w.length >= 4 && w === t) found.push(`HIT word ${w}`);
  }
  for (const ph of phrases) {
    if (ph.length && (seqIn(ph, words) || (words.length >= 2 && seqIn(words, ph)))) found.push(`HIT phrase ${ph.join(' ')}`);
  }
  for (const r of ROOTS) if (words.some((w) => w.endsWith(r) && w !== r)) found.push(`ROOT -${r}`);
  for (const t of terms) for (const w of new Set([n, ...words])) if (w.length >= 5 && t.length >= 5 && w !== t && lev(w, t) <= 2) found.push(`NEAR ${t}`);
  const uniq = [...new Set(found)];
  if (uniq.some((f) => f.startsWith('HIT'))) hits++;
  rows.push([group, name, uniq.length ? uniq.join(', ') : 'clean']);
}
const w0 = Math.max(...rows.map((r) => r[0].length)), w1 = Math.max(...rows.map((r) => r[1].length));
for (const [g, n, v] of rows) console.log(`${g.padEnd(w0)}  ${n.padEnd(w1)}  ${v}`);
console.log(`\n${rows.length} names, ${hits} HIT, ${rows.filter((r) => r[2].includes('GENERIC')).length} GENERIC, ${rows.filter((r) => r[2].includes('ROOT')).length} ROOT, ${rows.filter((r) => r[2].includes('NEAR')).length} NEAR`);
process.exit(hits ? 1 : 0);
