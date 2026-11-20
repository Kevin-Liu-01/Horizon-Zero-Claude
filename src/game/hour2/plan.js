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
 *
 * R8 WIRED (M3 wave 2b, area C; the orchestrator's ruling R8: "Leg 5 and the exit's two-leg pairing keep their 900 s
 * bar: shorten the route (a nearer Brazier, a road) rather than the bar; propose with numbers"). The route proposed at
 * M3 wave 2 (./route.js, its numbers and why) is the plan now: three beats take its budgets, each keeps its wave-1
 * budget as `wave1S` (the old text kept), and each names the new piece it needs, so the runner fails it by that name
 * until its owner builds it:
 *   gauge-tide  275 -> 60 s   rest at the cistern's Brazier until the Gauge's tide turns ('brazier:tide-rest')
 *   hand-net     50 -> 40 s   the fishing hut on the Glass's shore, 40 m from B2 toward the stud (PLACES.fishingHut)
 *   oro-yards    72 -> 52 s   WALK THE LINE from the re-surveyed B2 to B1, then on foot to Oro ('travel:b2-node')
 * Leg 5 290 s (327 with its boot), legs 4+5 784 s, legs 5+6 884 s, against EXIT_LAUNCH_S 900.
 */
import { TRIG, TRIG_TOP, SCAR, TUBES, REST, siteById } from '../../world/island/sites.js';
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
/** BIBLE §8 B2 (engine x, z): see PLACES.b2. */
const B2 = en(-380, -180);
/** R8: the fishing hut stands this far from B2 on the line from B2 to the guild-house stud (the Glass's shore). */
export const HUT_FROM_B2_M = 40;
const hutR8 = () => {
  const L = Math.hypot(GUILD_STUD.x - B2.x, GUILD_STUD.z - B2.z), k = HUT_FROM_B2_M / L, r1 = (v) => Math.round(v * 10) / 10;
  return Object.freeze({ x: r1(B2.x + (GUILD_STUD.x - B2.x) * k), z: r1(B2.z + (GUILD_STUD.z - B2.z) * k) });
};

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
  b2: B2,
  // the fishing hut has no place in the bible or the tree. R8 (wired at M3 wave 2b): on the Glass's shore, 40 m from B2
  // toward the stud, (-341.5, 190.7): 84 m from the stud, so leg 5's 'hand-net' is 40 s and leg 6 walks 40 m to B2.
  // Was (wave 1 fix): "row 0's default: the dry head of the black beach, 20 m west of the beach's site point, 0.9 m over
  // the sea (a proposal, placed by area A at wave 2)", (-210, 400). (At ed90645 it was (-352, 330), under the Sounding
  // Ring's arc: seen on leg 6's Continue at 37a7a5e)
  fishingHut: hutR8(),
  // R8: Brea's own Brazier at the cistern (the home Brazier stands at REST's seat), 40 m from the stud: leg 5 rests
  // here until the Gauge's tide turns
  brazier: Object.freeze({ x: REST.x, z: REST.z }),
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
  // M3 wave 3 (area E): W3's held card ('rung-held', src/game/text/cards/hour-two-w3.json) as the live quest reads it
  'card:rung-7-held': { what: 'the reward card that holds rung 7 at Oro\'s (writing, W3)', probe: `!!C.hour2?.kilnYards?.S?.card?.('rung-held')` },
  // R8 (wired at M3 wave 2b): the two new pieces the shorter route needs. The rest's hook follows the noon rest's
  // (braziers.js `noonFor`, set by the runtime): the cistern's dialog offers the Gauge's turn of the tide as a stop
  'brazier:tide-rest': { what: 'R8: the cistern Brazier\'s rest offers the Gauge\'s turn of the tide as a stop, and the Gauge\'s tide clock is carried through it (systems: braziers ctx.braziers.tideFor, as noonFor; instruments: gauge.js reads the rest; writing: the row\'s words, W3)', probe: `typeof C.braziers?.tideFor === 'function'` },
  'travel:b2-node': { what: 'R8: Benchmark 2, once re-surveyed, is a WALK THE LINE node (systems: TrueGround.nodes(); the bible\'s B2 reconciled by area G, as bm:b2)', probe: `false` },
});

/** @typedef {{ id: string, leg: 4|5|6, quest: string|null, event: string, where?: object, budgetS: number, wave1S?: number, needs: string[], danger?: string, place: string, note?: string }} Beat */

const beat = (o) => Object.freeze({ ...o, needs: Object.freeze(o.needs) });

/** The 27 beats, in order. */
export const BEATS = Object.freeze([
  // ---- leg 4: from the save leg 3 wrote (after the Transit read, calima asked at noon) - "A Line Over the Glass"
  beat({ id: 'weather-clears', leg: 4, quest: null, event: 'weather', where: { state: 'trade' }, budgetS: 30, place: 'malpaisEdge',
    needs: ['weather:flyable'], note: 'row 0 default: the ask clears at the first rest; Ansel\'s card never offers the flight in calima' }),
  beat({ id: 'walk-the-line', leg: 4, quest: GLASS_LINE_ID, event: 'travel-arrived', where: { node: 'guild-stud' }, budgetS: 65, place: 'b1',
    needs: ['travel:walk-the-line', 'quest:glass-line'], note: 'refused while Flagged or within 60 m of a wary Instrument' }),
  beat({ id: 'ansel-kite', leg: 4, quest: GLASS_LINE_ID, event: 'scene-done', where: { scene: 'kite' }, budgetS: 20, place: 'ansel', needs: ['quest:glass-line'] }),
  beat({ id: 'wreck', leg: 4, quest: GLASS_LINE_ID, event: 'gathered', where: { source: 'wreck', item: 'sailcloth' }, budgetS: 50, place: 'wreck',
    needs: ['quest:glass-line', 'site:wreck', 'items:sailcloth-cord'] }),
  beat({ id: 'cane-cord', leg: 4, quest: GLASS_LINE_ID, event: 'gathered', where: { cane: 8, cord: 4 }, budgetS: 30, place: 'wreck',
    needs: ['quest:glass-line', 'items:sailcloth-cord'] }),
  beat({ id: 'rebuild', leg: 4, quest: GLASS_LINE_ID, event: 'kite-rebuilt', budgetS: 50, place: 'guildStud', needs: ['quest:glass-line', 'kite:item'] }),
  beat({ id: 'tether', leg: 4, quest: GLASS_LINE_ID, event: 'sonde-cut', where: { sonde: 'ring' }, budgetS: 60, place: 'sonde',
    needs: ['quest:glass-line', 'kind:sonde'], danger: 'tether', note: 'cut BEFORE the flight: a flight with the Sonde moored is Flagged' }),
  beat({ id: 'launch', leg: 4, quest: GLASS_LINE_ID, event: 'kite:open', where: { from: 'T1' }, budgetS: 40, place: 't1',
    needs: ['quest:glass-line', 'kite:item', 'kite:flight-state', 'weather:flyable'] }),
  beat({ id: 'fly', leg: 4, quest: GLASS_LINE_ID, event: 'kite:land', where: { near: 'sounding-ring', maxSpeed: 3 }, budgetS: 40, place: 'ring',
    needs: ['quest:glass-line', 'kite:flight-state', 'kite:lift', 'weather:wind'], note: 'T1 to the Ring in one flight, landing <= 3 m/s' }),
  beat({ id: 'kite-given', leg: 4, quest: GLASS_LINE_ID, event: 'quest-rewarded', where: { item: 'survey-kite' }, budgetS: 35, place: 'ansel',
    needs: ['quest:glass-line', 'kite:item'] }),
  // ---- leg 5: from leg 4's save - "The Wrong Tide" (area G) and the fishing hut
  beat({ id: 'gauge-tide', leg: 5, quest: WRONG_TIDE_ID, event: 'tide-followed', budgetS: 60, wave1S: 275, place: 'gauge',
    needs: ['quest:wrong-tide', 'kind:gauge-attacks', 'brazier:tide-rest'], danger: 'gauge',
    note: 'R8: walk to the cistern\'s Brazier, rest until the tide turns, walk to the Gauge (wave 1: 265 s waiting for its leave)' }),
  beat({ id: 'find-b2', leg: 5, quest: WRONG_TIDE_ID, event: 'benchmark-found', where: { id: 'b2' }, budgetS: 30, place: 'b2', needs: ['quest:wrong-tide', 'bm:b2'] }),
  beat({ id: 'resurvey-b2', leg: 5, quest: WRONG_TIDE_ID, event: 'resurvey-done', where: { benchmark: 'b2' }, budgetS: 60, place: 'b2', needs: ['quest:wrong-tide', 'bm:b2'], danger: 'resurvey-b2' }),
  beat({ id: 'clock-returns', leg: 5, quest: WRONG_TIDE_ID, event: 'gauge-returned', budgetS: 60, place: 'gauge', needs: ['quest:wrong-tide'] }),
  beat({ id: 'rung-3', leg: 5, quest: WRONG_TIDE_ID, event: 'rung-made', where: { rung: 'reckoner' }, budgetS: 40, place: 'guildStud', needs: ['quest:wrong-tide', 'rung:3'] }),
  beat({ id: 'hand-net', leg: 5, quest: null, event: 'item-taken', where: { item: 'hand-net', at: 'fishing-hut' }, budgetS: 40, wave1S: 50, place: 'fishingHut',
    needs: ['site:fishing-hut'], note: 'R8: the hut on the Glass\'s shore, 84 m from the stud' }),
  // ---- leg 6: from leg 5's save - "The Kiln Yards"
  beat({ id: 'oro-yards', leg: 6, quest: KILN_YARDS_ID, event: 'scene-done', where: { scene: 'yards' }, budgetS: 52, wave1S: 72, place: 'oro',
    needs: ['quest:kiln-yards', 'bm:b2', 'travel:b2-node'],
    note: 'Oro gives it only after "True Ground"; R8: the hut to B2 on foot, WALK THE LINE to B1, B1 to Oro on foot' }),
  beat({ id: 'climb', leg: 6, quest: KILN_YARDS_ID, event: 'region-enter', where: { region: 'malpais' }, budgetS: 75, place: 'kilnYards',
    needs: ['quest:kiln-yards', 'region:malpais'], danger: 'walk-out', note: 'walked: it is upwind' }),
  beat({ id: 'plugged', leg: 6, quest: KILN_YARDS_ID, event: 'wellhead-reached', where: { unseen: true, plugged: true }, budgetS: 50, place: 'kilnYards',
    needs: ['quest:kiln-yards', 'site:wellheads', 'kind:kiln'] }),
  ...[1, 2, 3, 4].map((n) => beat({ id: `quench-${n}`, leg: 6, quest: KILN_YARDS_ID, event: 'wellhead-quenched', where: { n }, budgetS: 42, place: 'kilnYards',
    needs: ['quest:kiln-yards', 'site:wellheads', 'kind:kiln', ...(n === 3 ? ['kind:davit'] : []), ...(n === 4 ? ['kind:spindle'] : [])], danger: `wellhead-${n}`,
    note: n === 4 ? 'the Spindle met on the way' : n === 3 ? 'a Davit from the third wellhead (Q4 default)' : undefined })),
  beat({ id: 'yards-quiet', leg: 6, quest: KILN_YARDS_ID, event: 'yards-quiet', budgetS: 20, place: 'kilnYards', needs: ['quest:kiln-yards', 'site:wellheads'] }),
  beat({ id: 'tube-rest', leg: 6, quest: KILN_YARDS_ID, event: 'rested', where: { brazier: 'tube-shelter' }, budgetS: 40, place: 'tubeShelter',
    needs: ['quest:kiln-yards', 'site:tube-shelter'], danger: 'walk-out' }),
  beat({ id: 'scar-flight', leg: 6, quest: KILN_YARDS_ID, event: 'kite:land', where: { near: 'scar-foot' }, budgetS: 70, place: 'scarTop',
    needs: ['quest:kiln-yards', 'kite:flight-state', 'site:scar-posts', 'weather:wind'], note: 'home down the 7 posts' }),
  beat({ id: 'rung-7-held', leg: 6, quest: KILN_YARDS_ID, event: 'quest-rewarded', where: { held: 'rung-7' }, budgetS: 45, place: 'oro',
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

/**
 * The walks of each leg, place to place (straight lines: a LOWER bound; the nav grid's walk is longer). Leg 4 starts with
 * WALK THE LINE to B1 (a travel, not a walk: hour.js ctx.travel.walkTheLine sets her at the benchmark), then B1 to the
 * stud on foot (fix round 1: at ed90645 leg 4 walked the edge to B1 and left out the Ring to Ansel; leg 6 the Scar's foot
 * to Oro). The flights are apart (`FLIGHTS`, at the kite's still-air 7.5 m/s).
 */
export const WALKS = Object.freeze({
  4: Object.freeze([['b1', 'guildStud'], ['guildStud', 'wreck'], ['wreck', 'guildStud'], ['guildStud', 'sonde'], ['sonde', 't1'], ['ring', 'ansel']]),
  // R8: leg 5 goes by the cistern's Brazier to the Gauge (wave 1: the ring straight to the gauge); leg 6 walks the hut to
  // B2, WALKS THE LINE to B1 (TRAVELS) and walks B1 to Oro (wave 1: the hut to Oro on foot)
  5: Object.freeze([['ring', 'brazier'], ['brazier', 'gauge'], ['gauge', 'b2'], ['b2', 'gauge'], ['gauge', 'guildStud'], ['guildStud', 'fishingHut']]),
  6: Object.freeze([['fishingHut', 'b2'], ['b1', 'oro'], ['oro', 'kilnYards'], ['kilnYards', 'tubeShelter'], ['tubeShelter', 'scarTop'], ['scarFoot', 'oro']]),
});
export const FLIGHTS = Object.freeze({ 4: Object.freeze([['t1', 'ring']]), 5: Object.freeze([]), 6: Object.freeze([['scarTop', 'scarFoot']]) });
/** WALK THE LINE between travel nodes (no metres walked; leg 4's first beat is one too, from the Malpais edge to B1).
 * R8: leg 6's B2 to B1. */
export const TRAVELS = Object.freeze({ 4: Object.freeze([['malpaisEdge', 'b1']]), 5: Object.freeze([]), 6: Object.freeze([['b2', 'b1']]) });

/**
 * The runner's cap per leg (sim seconds of play from the Chrome slot; tools/gates/systems/hour-two.mjs --leg-budget) and
 * the brief's estimate of each leg's play (M3-BRIEFS §3.6: about 7, 6 and 9 minutes). A leg's beat budgets sum to at
 * most the cap less a boot (BOOT_S: CONTINUE to playing, 37 s per leg at 3d398ef), so no leg is capped inside its
 * budgets; the exit pairs two legs per launch under 15 minutes (EXIT_LAUNCH_S).
 */
export const LEG_CAP_S = 600;
export const BOOT_S = 37;
export const EXIT_LAUNCH_S = 900;
export const BRIEF_EST_S = Object.freeze({ 4: 420, 5: 360, 6: 540 });

/**
 * The Gauge's tide (src/instruments/kinds/gauge.js CLOCK, handed in so this module stays free of the kinds): from its
 * spawn at the open reading to leaving for the Glass and back at Sluice 3, in sim seconds. Leg 5's 'gauge-tide' waits
 * for the leave and 'clock-returns' for the return.
 */
export function gaugeTide(CLOCK, OPEN_PHASE) {
  const toLeave = (CLOCK.leaveAt - OPEN_PHASE) * CLOCK.period, toReturn = (CLOCK.returnAt - OPEN_PHASE) * CLOCK.period;
  return { periodS: CLOCK.period, openPhase: +OPEN_PHASE.toFixed(3), spawnToLeaveS: +toLeave.toFixed(1), spawnToReturnS: +toReturn.toFixed(1), awayS: +(toReturn - toLeave).toFixed(1) };
}

/**
 * Row 0: is T3 (Rust Cone's pillar) SIGHTED on hour two's path? From each place (her eye 1.6 m over the ground, or
 * `agl` in the air) to the pillar's top (TRIG_TOP over the cone's ground), the island's ground sampled every 2 m along the
 * line (`heightAt` handed in): clear or the first blocking point. Sighting T3 closes nothing yet: the Malpais figure
 * also needs B5 and B6 re-surveyed (BIBLE §8).
 */
export function trigSight(heightAt, trig, top, from, { eye = 1.6, step = 2 } = {}) {
  const y0 = heightAt(from.x, from.z) + eye, y1 = heightAt(trig.x, trig.z) + top;
  const L = Math.hypot(trig.x - from.x, trig.z - from.z);
  let worst = Infinity, at = null;
  for (let s = step; s < L - step; s += step) {
    const k = s / L, x = from.x + (trig.x - from.x) * k, z = from.z + (trig.z - from.z) * k;
    const clear = y0 + (y1 - y0) * k - heightAt(x, z);
    if (clear < worst) { worst = clear; at = { m: +s.toFixed(0), x: +x.toFixed(1), z: +z.toFixed(1) }; }
  }
  return { distM: +L.toFixed(1), clear: worst > 0, minClearM: +worst.toFixed(1), at };
}

const dist = (a, b) => Math.hypot(PLACES[a].x - PLACES[b].x, PLACES[a].z - PLACES[b].z);

/** Row 0's arithmetic for a leg: metres walked (straight lines), seconds at a jog, game hours on the mean clock, plus the
 * beats' game-time budgets. */
export function legClock(leg) {
  const walks = WALKS[leg].map(([a, b]) => ({ from: a, to: b, m: +dist(a, b).toFixed(1) }));
  const flights = FLIGHTS[leg].map(([a, b]) => ({ from: a, to: b, m: +dist(a, b).toFixed(1) }));
  const travels = TRAVELS[leg].map(([a, b]) => ({ from: a, to: b, m: +dist(a, b).toFixed(1) }));   // not walked
  const m = walks.reduce((s, w) => s + w.m, 0), fm = flights.reduce((s, w) => s + w.m, 0);
  const walkS = m / JOG_MS, flyS = fm / KITE.forward, moveS = walkS + flyS;
  const budgetS = beatsOfLeg(leg).reduce((s, b) => s + b.budgetS, 0);
  return { leg, walks, flights, travels, metres: +m.toFixed(1), walkS: +walkS.toFixed(1), flyS: +flyS.toFixed(1), moveS: +moveS.toFixed(1),
    walkGameH: +(walkS / S_PER_GAME_HOUR).toFixed(2), budgetS, budgetGameH: +(budgetS / S_PER_GAME_HOUR).toFixed(2),
    estS: BRIEF_EST_S[leg], capS: LEG_CAP_S, fitsCap: budgetS + BOOT_S <= LEG_CAP_S, budgetOverMoveS: +(budgetS - moveS).toFixed(1) };
}

/** The exit's launches of two legs (M3-BRIEFS §3.6: legs 1-6 in three launches, none over 15 minutes): legs 5 and 6 at
 * their budgets and two boots. Legs 1-3 are the first hour's and not counted here. */
export function exitPairS(a, b) {
  const sum = (leg) => beatsOfLeg(leg).reduce((s, x) => s + x.budgetS, 0);
  const s = sum(a) + sum(b) + 2 * BOOT_S;
  return { legs: [a, b], s, fits: s <= EXIT_LAUNCH_S };
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
