/**
 * HOUR TWO, THE PLAN (Milestone 3 wave 1, area E: HT0). Owner: systems. Pure data and arithmetic: no THREE, no DOM,
 * no ctx, so Node reads it (tools/gates/systems/hour-two.mjs, hour-two-fixtures.mjs, hour-two-plan.test.mjs).
 *
 * The three hour-two quests of BIBLE 11.3 as the run's legs 4-6 (the first hour's numbering continues): 27 beats, in
 * the order M3-BRIEFS §1 and §3.6 build to. Each beat names
 *   - `quest` and the stage id the quest's spine will carry (the beat passes when `ctx.quests[quest].report().reached`
 *     holds it), or `quest: null` with `event` for the world beats (the weather, the fishing hut's net);
 *   - `event`: the ctx.events name (and payload match) the stage waits for, so the emitting areas use these names;
 *   - `budgetS`: the beat's budget in GAME time (sim seconds of play; rule 13: a driver never gives up on a count, it
 *     waits for the world to change or walks to a new place inside this budget);
 *   - `needs`: the seams and pieces it cannot play without, in the order the runner checks them. The first one the
 *     page lacks is the name the beat fails by ("not built: ...") until it plays;
 *   - `danger`: the beat has an hp row in Node first (rule 22: 10 simulated plays, lowest hp >= 25), named here.
 * Nothing here is wired into the runtime; the stage tables of the three quests are written against it in wave 2.
 */
import { TRIG, TRIG_TOP, SCAR, TUBES, siteById } from '../../world/island/sites.js';
import { BENCHMARKS, GAUGE, fieldPoint } from '../../world/sites/layout.js';
import { GUILD_STUD } from '../../world/settlements/saltrow-layout.js';

export const GLASS_LINE_ID = 'glass-line';     // "A Line Over the Glass" (Ansel; the Survey Kite)
export const WRONG_TIDE_ID = 'wrong-tide';     // "The Wrong Tide" (Ansel; rung 3), area G's quest on the path
export const KILN_YARDS_ID = 'kiln-yards';     // "The Kiln Yards" (Oro; rung 7 held)
export const HOUR2_QUESTS = Object.freeze([GLASS_LINE_ID, WRONG_TIDE_ID, KILN_YARDS_ID]);

const en = (e, n) => Object.freeze({ x: e, z: -n });   // the bible's (E, N) -> engine (x, z); ISLAND_SCALE 1
const site = (id) => { const s = siteById(id); return Object.freeze({ x: s.x, z: s.z }); };
const T1 = TRIG.find((t) => t.id === 'T1');
const B1 = BENCHMARKS.find((b) => b.id === 'bm-01');

/**
 * Where hour two's beats happen (engine x, z). `malpaisEdge` is where the first hour ends (leg 3's 'calima-cross' and
 * 'read-transit'): the first point on the line from Ninewalls to the Kiln Yards 11 m inside the Malpais (the regions
 * seam's enter is 10 m in), computed at M3 wave 1 from src/core/regions.js on the island recipe.
 */
export const PLACES = Object.freeze({
  malpaisEdge: Object.freeze({ x: 133.6, z: 96.0 }),
  b1: Object.freeze({ x: B1.x, z: B1.z }),
  guildStud: Object.freeze({ x: GUILD_STUD.x, z: GUILD_STUD.z }),
  ansel: Object.freeze({ x: GUILD_STUD.x, z: GUILD_STUD.z }),
  // the kite's wreck on the black beach (BIBLE 11.3); the beach's site point until area A places the wreck
  wreck: site('black-sand-beach'),
  // the moored Sonde at the Sounding Ring; its post is area C's (wave 1 grey hull)
  sonde: site('sounding-ring'),
  t1: Object.freeze({ x: T1.x, z: T1.z, top: TRIG_TOP }),
  ring: site('sounding-ring'),
  gauge: Object.freeze(fieldPoint(GAUGE.u, GAUGE.v)),
  // BIBLE §8 B2: "a bronze post standing in the Glass". The code's 'bm-02' is the Jameo benchmark (layout.js), which
  // is the bible's B4: the ids are reconciled by area G at its row 0 (BACKLOG); the run walks to the bible's point
  b2: en(-380, -180),
  // the fishing hut has no place in the bible or the tree; row 0's default: the head of the black beach by the
  // Saltrow boat ramp (a proposal, placed by area A at wave 2)
  fishingHut: Object.freeze({ x: -352, z: 330 }),
  oro: Object.freeze({ x: 3.0, z: 206.5 }),
  kilnYards: site('kiln-yards'),
  tubeShelter: Object.freeze({ ...TUBES['malpais-tube'][0] }),
  scarTop: Object.freeze({ x: SCAR.a.x, z: SCAR.a.z }),
  scarFoot: Object.freeze({ x: SCAR.b.x, z: SCAR.b.z }),
});

/**
 * The seams and pieces a beat can need, each with what the runner reads in the page to say it is there. The ids are
 * the brief's (§3.2 seams; §4-§8 pieces). `probe` is a short JS expression on (C = window.__CTX__, P = C.player,
 * M = C.machines, E = C.environment) that is truthy when the piece exists; the runner evaluates it in the page.
 */
export const NEEDS = Object.freeze({
  'quest:glass-line': { what: `"A Line Over the Glass" wired into the runtime (src/game/quest/glass-line-plan.js)`, probe: `!!C.quests?.['${GLASS_LINE_ID}']` },
  'quest:wrong-tide': { what: `"The Wrong Tide" wired into the runtime (area G)`, probe: `!!C.quests?.['${WRONG_TIDE_ID}']` },
  'quest:kiln-yards': { what: `"The Kiln Yards" wired into the runtime (src/game/quest/kiln-yards-plan.js)`, probe: `!!C.quests?.['${KILN_YARDS_ID}']` },
  'weather:flyable': { what: 'the weather seam\'s flyable() (sky-look, src/world/environment.js)', probe: `typeof E?.flyable === 'function'` },
  'weather:wind': { what: 'the weather seam\'s windAt(x, z, t)', probe: `typeof E?.windAt === 'function'` },
  'travel:walk-the-line': { what: 'WALK THE LINE between travel nodes (systems: B1 and the guild-house stud)', probe: `typeof C.travel?.walkTheLine === 'function'` },
  'kite:flight-state': { what: 'the flight state seam player.flight (hero-anim, src/entities/player.js)', probe: `typeof P?.flight === 'string'` },
  'kite:lift': { what: 'the lift field liftAt(x, y, z) (world, src/world/island/lift.js)', probe: `typeof C.world?.liftAt === 'function' || typeof C.lift?.liftAt === 'function'` },
  'kite:item': { what: 'the Survey Kite as an item (armory and systems)', probe: `!!C.items?.byId?.('survey-kite')` },
  'site:wreck': { what: 'the kite\'s wreck on the black beach (world)', probe: `!!C.world?.sites?.wreck` },
  'items:sailcloth-cord': { what: 'cane x8, cord x4 and sailcloth as gatherables (systems, items)', probe: `!!C.items?.byId?.('sailcloth') && !!C.items?.byId?.('cord')` },
  'kind:sonde': { what: 'the Sonde moored at the Ring with a tether to cut (instruments, area C)', probe: `!!M?.canSpawn?.('sonde')` },
  'kind:gauge-attacks': { what: 'the Gauge\'s attack set and its tide walk (area G of the M2 brief)', probe: `!!M?.kindRules?.gauge?.attacks` },
  'bm:b2': { what: 'Benchmark 2 in the Glass (the bible\'s B2; the code\'s bm-02 is the Jameo\'s)', probe: `false` },
  'rung:3': { what: 'rung 3 (Reckoner) made at the guild house (armory, area G)', probe: `!!C.armory?.rungs?.reckoner` },
  'site:fishing-hut': { what: 'the fishing hut and its Hand Net (world, armory)', probe: `!!C.world?.sites?.['fishing-hut']` },
  'kind:kiln': { what: 'the Kiln (instruments, area C)', probe: `!!M?.canSpawn?.('kiln')` },
  'kind:spindle': { what: 'the Spindle (instruments, area C)', probe: `!!M?.canSpawn?.('spindle')` },
  'kind:davit': { what: 'the Davit (instruments, area C)', probe: `!!M?.canSpawn?.('davit')` },
  'site:wellheads': { what: 'the four wellheads seam (world, src/world/sites/kilnyards-layout.js)', probe: `Array.isArray(C.world?.wellheads) && C.world.wellheads.length === 4` },
  'region:malpais': { what: 'the Malpais built as a region (regions.js built: true; world\'s ground)', probe: `!!C.engine?.regions?.map?.regions?.find?.((r) => r.id === 'malpais' && r.built)` },
  'site:tube-shelter': { what: 'the Malpais tube shelter and its Brazier (world, systems)', probe: `!!C.braziers?.byId?.('tube-shelter')` },
  'site:scar-posts': { what: 'the Scar\'s 7 line-posts (world, area B)', probe: `(C.world?.linePosts?.scar?.length ?? 0) === 7` },
  'card:rung-7-held': { what: 'the reward card that holds rung 7 at Oro\'s (writing, W3)', probe: `false` },
});

/** @typedef {{ id: string, leg: 4|5|6, quest: string|null, event: string, where?: object, budgetS: number, needs: string[], danger?: string, place: string, note?: string }} Beat */

const beat = (o) => Object.freeze({ ...o, needs: Object.freeze(o.needs) });

/** The 27 beats, in order. */
export const BEATS = Object.freeze([
  // ---- leg 4: from the save leg 3 wrote (after the Transit read, calima asked at noon) - "A Line Over the Glass"
  beat({ id: 'weather-clears', leg: 4, quest: null, event: 'weather', where: { state: 'trade' }, budgetS: 240, place: 'malpaisEdge',
    needs: ['weather:flyable'], note: 'row 0 default: the ask clears at the first rest; Ansel\'s card never offers the flight in calima' }),
  beat({ id: 'walk-the-line', leg: 4, quest: GLASS_LINE_ID, event: 'travel-arrived', where: { node: 'guild-stud' }, budgetS: 180, place: 'b1',
    needs: ['travel:walk-the-line', 'quest:glass-line'], note: 'refused while Flagged or within 60 m of a wary Instrument' }),
  beat({ id: 'ansel-kite', leg: 4, quest: GLASS_LINE_ID, event: 'scene-done', where: { scene: 'kite' }, budgetS: 90, place: 'ansel', needs: ['quest:glass-line'] }),
  beat({ id: 'wreck', leg: 4, quest: GLASS_LINE_ID, event: 'gathered', where: { source: 'wreck', item: 'sailcloth' }, budgetS: 150, place: 'wreck',
    needs: ['quest:glass-line', 'site:wreck', 'items:sailcloth-cord'] }),
  beat({ id: 'cane-cord', leg: 4, quest: GLASS_LINE_ID, event: 'gathered', where: { cane: 8, cord: 4 }, budgetS: 180, place: 'wreck',
    needs: ['quest:glass-line', 'items:sailcloth-cord'] }),
  beat({ id: 'rebuild', leg: 4, quest: GLASS_LINE_ID, event: 'kite-rebuilt', budgetS: 150, place: 'guildStud', needs: ['quest:glass-line', 'kite:item'] }),
  beat({ id: 'tether', leg: 4, quest: GLASS_LINE_ID, event: 'sonde-cut', where: { sonde: 'ring' }, budgetS: 150, place: 'sonde',
    needs: ['quest:glass-line', 'kind:sonde'], danger: 'tether', note: 'cut BEFORE the flight: a flight with the Sonde moored is Flagged' }),
  beat({ id: 'launch', leg: 4, quest: GLASS_LINE_ID, event: 'kite:open', where: { from: 'T1' }, budgetS: 120, place: 't1',
    needs: ['quest:glass-line', 'kite:item', 'kite:flight-state', 'weather:flyable'] }),
  beat({ id: 'fly', leg: 4, quest: GLASS_LINE_ID, event: 'kite:land', where: { near: 'sounding-ring', maxSpeed: 3 }, budgetS: 120, place: 'ring',
    needs: ['quest:glass-line', 'kite:flight-state', 'kite:lift', 'weather:wind'], note: 'T1 to the Ring in one flight, landing <= 3 m/s' }),
  beat({ id: 'kite-given', leg: 4, quest: GLASS_LINE_ID, event: 'quest-rewarded', where: { item: 'survey-kite' }, budgetS: 60, place: 'ansel',
    needs: ['quest:glass-line', 'kite:item'] }),
  // ---- leg 5: from leg 4's save - "The Wrong Tide" (area G) and the fishing hut
  beat({ id: 'gauge-tide', leg: 5, quest: WRONG_TIDE_ID, event: 'tide-followed', budgetS: 300, place: 'gauge', needs: ['quest:wrong-tide', 'kind:gauge-attacks'], danger: 'gauge' }),
  beat({ id: 'find-b2', leg: 5, quest: WRONG_TIDE_ID, event: 'benchmark-found', where: { id: 'b2' }, budgetS: 120, place: 'b2', needs: ['quest:wrong-tide', 'bm:b2'] }),
  beat({ id: 'resurvey-b2', leg: 5, quest: WRONG_TIDE_ID, event: 'resurvey-done', where: { benchmark: 'b2' }, budgetS: 120, place: 'b2', needs: ['quest:wrong-tide', 'bm:b2'], danger: 'resurvey-b2' }),
  beat({ id: 'clock-returns', leg: 5, quest: WRONG_TIDE_ID, event: 'gauge-returned', budgetS: 120, place: 'gauge', needs: ['quest:wrong-tide'] }),
  beat({ id: 'rung-3', leg: 5, quest: WRONG_TIDE_ID, event: 'rung-made', where: { rung: 'reckoner' }, budgetS: 120, place: 'guildStud', needs: ['quest:wrong-tide', 'rung:3'] }),
  beat({ id: 'hand-net', leg: 5, quest: null, event: 'item-taken', where: { item: 'hand-net', at: 'fishing-hut' }, budgetS: 150, place: 'fishingHut', needs: ['site:fishing-hut'] }),
  // ---- leg 6: from leg 5's save - "The Kiln Yards"
  beat({ id: 'oro-yards', leg: 6, quest: KILN_YARDS_ID, event: 'scene-done', where: { scene: 'yards' }, budgetS: 240, place: 'oro', needs: ['quest:kiln-yards'],
    note: 'Oro gives it only after "True Ground"' }),
  beat({ id: 'climb', leg: 6, quest: KILN_YARDS_ID, event: 'region-enter', where: { region: 'malpais' }, budgetS: 180, place: 'kilnYards',
    needs: ['quest:kiln-yards', 'region:malpais'], danger: 'walk-out', note: 'walked: it is upwind' }),
  beat({ id: 'plugged', leg: 6, quest: KILN_YARDS_ID, event: 'wellhead-reached', where: { unseen: true, plugged: true }, budgetS: 180, place: 'kilnYards',
    needs: ['quest:kiln-yards', 'site:wellheads', 'kind:kiln'] }),
  ...[1, 2, 3, 4].map((n) => beat({ id: `quench-${n}`, leg: 6, quest: KILN_YARDS_ID, event: 'wellhead-quenched', where: { n }, budgetS: 150, place: 'kilnYards',
    needs: ['quest:kiln-yards', 'site:wellheads', 'kind:kiln', ...(n === 3 ? ['kind:davit'] : []), ...(n === 4 ? ['kind:spindle'] : [])], danger: `wellhead-${n}`,
    note: n === 4 ? 'the Spindle met on the way' : n === 3 ? 'a Davit from the third wellhead (Q4 default)' : undefined })),
  beat({ id: 'yards-quiet', leg: 6, quest: KILN_YARDS_ID, event: 'yards-quiet', budgetS: 60, place: 'kilnYards', needs: ['quest:kiln-yards', 'site:wellheads'] }),
  beat({ id: 'tube-rest', leg: 6, quest: KILN_YARDS_ID, event: 'rested', where: { brazier: 'tube-shelter' }, budgetS: 150, place: 'tubeShelter',
    needs: ['quest:kiln-yards', 'site:tube-shelter'], danger: 'walk-out' }),
  beat({ id: 'scar-flight', leg: 6, quest: KILN_YARDS_ID, event: 'kite:land', where: { near: 'scar-foot' }, budgetS: 180, place: 'scarTop',
    needs: ['quest:kiln-yards', 'kite:flight-state', 'site:scar-posts', 'weather:wind'], note: 'home down the 7 posts' }),
  beat({ id: 'rung-7-held', leg: 6, quest: KILN_YARDS_ID, event: 'quest-rewarded', where: { held: 'rung-7' }, budgetS: 120, place: 'oro',
    needs: ['quest:kiln-yards', 'card:rung-7-held'], note: 'the card says rung 7 is held at Oro\'s while rung 6 is not owned' }),
]);

export const LEGS = Object.freeze([4, 5, 6]);
export const beatsOfLeg = (leg) => BEATS.filter((b) => b.leg === leg);

/* ------------------------------------------------------------------ row 0: time and weather (rule 18) */

/** Built speeds (src/entities/player.js SPEEDS: jog 5.0 m/s, the default W) and the clock (environment.js: 1800 s a day). */
export const JOG_MS = 5.0;
export const DAY_S = 1800;
export const S_PER_GAME_HOUR = DAY_S / 24;   // 75 s (the mean; the golden hours run slower, environment.js)
/** BIBLE 12, the Survey Kite in numbers: still air 7.5 m/s forward, 1.5 m/s sink (5:1). */
export const KITE = Object.freeze({ forward: 7.5, sink: 1.5, glide: 5 });

/** The walks of each leg, place to place (straight lines: a LOWER bound; the nav grid's walk is longer). */
export const WALKS = Object.freeze({
  4: Object.freeze([['malpaisEdge', 'b1'], ['guildStud', 'wreck'], ['wreck', 'guildStud'], ['guildStud', 'sonde'], ['sonde', 't1']]),
  5: Object.freeze([['ring', 'gauge'], ['gauge', 'b2'], ['b2', 'gauge'], ['gauge', 'guildStud'], ['guildStud', 'fishingHut']]),
  6: Object.freeze([['fishingHut', 'oro'], ['oro', 'kilnYards'], ['kilnYards', 'tubeShelter'], ['tubeShelter', 'scarTop']]),
});

const dist = (a, b) => Math.hypot(PLACES[a].x - PLACES[b].x, PLACES[a].z - PLACES[b].z);

/** Row 0's arithmetic for a leg: metres walked (straight lines), seconds at a jog, game hours on the mean clock, plus the
 * beats' game-time budgets. */
export function legClock(leg) {
  const walks = WALKS[leg].map(([a, b]) => ({ from: a, to: b, m: +dist(a, b).toFixed(1) }));
  const m = walks.reduce((s, w) => s + w.m, 0);
  const walkS = m / JOG_MS;
  const budgetS = beatsOfLeg(leg).reduce((s, b) => s + b.budgetS, 0);
  return { leg, walks, metres: +m.toFixed(1), walkS: +walkS.toFixed(1), walkGameH: +(walkS / S_PER_GAME_HOUR).toFixed(2), budgetS, budgetGameH: +(budgetS / S_PER_GAME_HOUR).toFixed(2) };
}

/** The test flight's arithmetic: T1's top to the Ring at 5:1 in still air. `heightAt` is the island's (handed in, so this
 * module stays free of the recipe). */
export function testFlight(heightAt) {
  const launch = heightAt(PLACES.t1.x, PLACES.t1.z) + PLACES.t1.top;
  const land = heightAt(PLACES.ring.x, PLACES.ring.z);
  const run = dist('t1', 'ring');
  return { launchM: +launch.toFixed(1), landM: +land.toFixed(1), dropM: +(launch - land).toFixed(1), runM: +run.toFixed(1),
    stillAirReachM: +((launch - land) * KITE.glide).toFixed(1), needsDropM: +(run / KITE.glide).toFixed(1), closesInStillAir: (launch - land) * KITE.glide >= run };
}
