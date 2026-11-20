// M3 area B: THE ROWS' SUMMARY, one line per acceptance line of KF0-KF11 (M3 briefs §5): PASS, FAIL or UNMEASURED with
// its number. `node --test` counts a `todo` row as "0 failed"; here a todo row is a FAIL (it is a bar not met, waiting on
// a ruling), and a row with no number yet is UNMEASURED (named with the wave and the bench that will measure it).
//   node tools/gates/kite/rows.mjs [--json <file>]        exit 1 when any line FAILs (UNMEASURED does not fail the exit)
// Runs, browser-free: node --test flight-law.test.mjs, hang-bench.mjs, row0.mjs.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { groundedDownTime, KITE } from '../../../src/game/kite/flight.js';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.resolve(HERE, '../../..');
const args = process.argv.slice(2);
const out = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const tmp = mkdtempSync(path.join(os.tmpdir(), 'kite-rows-'));
const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return null; } };

// 1. the Node rows: every test by name and its outcome (a todo counted as a FAIL)
const t = spawnSync(process.execPath, ['--test', '--test-reporter=tap', path.join(HERE, 'flight-law.test.mjs')], { encoding: 'utf8' });
const tests = [];
for (const line of t.stdout.split('\n')) {
  const m = /^(not ok|ok) \d+ - (.*?)(?: # (TODO|SKIP)\b(.*))?$/.exec(line);
  if (m) tests.push({ name: m[2], ok: m[1] === 'ok' && !m[3], todo: m[3] === 'TODO' ? m[4].trim() : null });
}
const T = (re) => tests.filter((x) => re.test(x.name));
const allOk = (re) => { const a = T(re); return a.length > 0 && a.every((x) => x.ok); };
// 2. the hang (Node bench on Brea dressed) and row 0
const hangF = path.join(tmp, 'hang.json'), row0F = path.join(tmp, 'row0.json');
execFileSync(process.execPath, [path.join(HERE, 'hang-bench.mjs'), '--json', hangF], { stdio: 'ignore' });
execFileSync(process.execPath, [path.join(HERE, 'row0.mjs'), '--json', row0F], { stdio: 'ignore' });
const H = JSON.parse(readFileSync(hangF, 'utf8')).rows, R0 = JSON.parse(readFileSync(row0F, 'utf8'));

const L = [];
const line = (id, what, status, number) => L.push({ id, what, status, number });
const pf = (b) => (b ? 'PASS' : 'FAIL');

// KF0
line('KF0a', 'T1 to the Ring', 'RECORDED', `${R0.a.distM} m on ${R0.a.bearing}; holding the track ${R0.a.glideHoldingTrack}:1 (crab ${R0.a.crabDeg} deg), needs ${R0.a.heightNeededM} m, has ${R0.a.heightHaveM} m (launch ${R0.a.T1.launchY} m), short ${R0.a.shortM} m; lands ${R0.a.straightSteadyTrade.landedM_fromRingCentre} m from the Ring's centre (steady trade), ${R0.a.straightGameWind.landedM_fromRingCentre} m (the game's wind); the Organ Shelf road: ${R0.a.byOrganShelfRoad.postsStreaming}/5 posts lift, gain ${R0.a.byOrganShelfRoad.gainM} m`);
line('KF0b', 'the Scar', 'RECORDED', `drop ${R0.b.dropM} m vs ${R0.b.heightNeededM} m needed; on the line lands at k ${R0.b.glideOnTheLine.landedAtK}; on the north-west lip passes the lower end ${R0.b.glideOnTheNorthWestLip.aglPassingTheLowerEnd} m up; ${R0.b.postsStreaming}/7 posts lift`);
line('KF0c', '60 m over the Pans', R0.c.reachable ? 'RECORDED' : 'RECORDED (not reachable)', `best ${R0.c.best.aglOverPans} m from ${R0.c.best.from} on ${R0.c.best.bearing}; per launch: ${R0.c.fromEveryTrig.map((r) => `${r.from} ${r.maxAglOverPans_anyBearing} m (${r.bearingsReaching60mOverPans} bearings >= 60)`).join(', ')}; F51 20 s off ${R0.c.F51.from} on ${R0.c.F51.headingDeg}: ${R0.c.F51.at20s?.agl} m over the ${R0.c.F51.at20s?.region}`);
line('KF0d', 'the furled roll beside the bow', 'UNMEASURED', R0.d.bench);
// KF1 (the static hang, Node)
line('KF1', 'wrists in front of the head plane (static hang)', pf(H.wristsInFront.pass), `${H.wristsInFront.min_m} m`);
line('KF1', 'wrists at or below head height (static hang)', pf(H.wristsAtOrBelowHead.pass), `${H.wristsAtOrBelowHead.min_belowHeadBone_m} m under the head bone`);
line('KF1', 'elbows below the shoulder joints (static hang)', pf(H.elbowsBelowShoulders.pass), `${H.elbowsBelowShoulders.max_elbowOverShoulder_m} m (max, elbow over shoulder)`);
line('KF1', 'bar between sternum and chin', pf(H.barSternumToChin.pass), `k ${H.barSternumToChin.k}`);
line('KF1', 'bar 0.30-0.40 m in front of the chest', pf(H.barInFrontOfChest.pass), `${H.barInFrontOfChest.fromClothedChest_m} m from the clothed chest, ${H.barInFrontOfChest.fromTorsoCapsule_m} m from the torso capsule`);
line('KF1', 'open, glide, banks, flare, fold, landing, interrupts', 'UNMEASURED', 'wave 2: tools/gates/hero-sweep/kite-*.mjs (the clips through handling.js; D3)');
// KF2-KF8 (Node)
line('KF2', 'still air 7.5 / 1.5 / 5:1; downwind 6.5:1, upwind 3.5:1', pf(allOk(/^KF2 /)), 'flight-law.test.mjs KF2 rows');
line('KF3', 'lift band, cap, 0 over flat, water, lee', pf(allOk(/^KF3 /)), 'flight-law.test.mjs KF3 rows (area A\'s liftAt)');
line('KF4', 'open only >= 0.35 s and >= 3 m; open 400-600 ms; fold <= 400 ms', pf(allOk(/^KF4 /)), `open ${KITE.openS * 1000} ms, fold ${KITE.foldS * 1000} ms (the law's times)`);
line('KF4', "the roll's hand-off obeys W1's palm and wrist bars", 'UNMEASURED', 'wave 2: tools/gates/kite/open-bench.mjs (the open and fold through handling.js)');
line('KF5', 'calima and squall: 0 of 10 opens, a field note in the bible\'s words', pf(allOk(/^KF5 grounded: /)), 'GROUNDED_NOTE from BIBLE §3.2 and §16');
line('KF5', 'brought down inside 5 s without damage, to 80 m', pf(allOk(/^KF5 grounded: /)), `${[60, 70, 80, 90].map((h) => `${h} m ${groundedDownTime(h).toFixed(2)} s`).join(', ')} (closed form)`);
const kf5hi = T(/^KF5 grounded from 200/)[0];
line('KF5', 'brought down inside 5 s from 200 m or more (the island allows 275)', kf5hi && kf5hi.ok ? 'PASS' : 'FAIL', `${[200, 207, 275].map((h) => `${h} m ${groundedDownTime(h).toFixed(1)} s`).join(', ')}, undamaged (${pf(allOk(/^KF5 grounded from every/))}); ruling: 5 s from 200 m is a 40 m/s mean descent`);
line('KF6', '<= 3 m/s: 0 damage; above: the fall rule', pf(allOk(/^KF6 landing/)), 'flight-law.test.mjs');
line('KF6', 'no landing past the 1.1 m contour (her final place)', pf(allOk(/^KF6 (no landing|the current|on the island)/)), 'shore fixtures and the black-sand beach: she stands at <= 1.1 m');
line('KF6', 'feet planted within 2 steps, foot rows unchanged', 'UNMEASURED', 'wave 3: the landing clip on the page (tools/gates/hero-sweep/kite-*.mjs)');
line('KF7', '5, 7, 6 posts of 3 m; cloth streams iff liftAt > 0 at the top', pf(allOk(/^KF7 the (wind roads|cloth)/)), 'a fixture with known answers');
for (const x of T(/^KF7 the (Organ|Scar|caldera)/)) line('KF7', x.name.replace(/^KF7 /, ''), x.ok ? 'PASS' : 'FAIL', x.todo || 'stream');
line('KF7', 'the first two roads flown end to end by the driver, 10 of 10', 'UNMEASURED', 'wave 3 (the page driver); both roads make no lift by the law today');
line('KF8', 'sight x2.0 gliding, x1.0 the step she lands; no weapon verb unless none', pf(allOk(/^KF8 /)), 'the seam: flight.js sightRangeMul (gliding only, as area C reads it), weaponVerbsAllowed; combat reads it at wave 3');
line('KF9', 'two rectangular cells, spars, <= 6 k tris, 1 draw', pf(H.kiteBudget.pass), `${H.kiteBudget.triangles} triangles, ${H.kiteBudget.draws} draw (grey; the orchil cell, the 512 set and the read-out: wave 2-3)`);
line('KF10', 'cloth in flight', 'UNMEASURED', 'wave 3');
line('KF11', 'cost in flight', 'UNMEASURED here', "F51 at blockout by tools/perf/attrib.mjs (the M0.8 back-to-back readback), at a commit; the 60 s glide: wave 3");

const commit = git('rev-parse', '--short', 'HEAD'), dirty = (git('status', '--porcelain', '--untracked-files=no') || '').length > 0;
console.log(`area B rows at ${commit}${dirty ? ' (TREE DIRTY: not a result)' : ' (clean tree)'}; node --test: ${tests.filter((x) => x.ok).length} ok, ${tests.filter((x) => x.todo).length} todo (FAIL), ${tests.filter((x) => !x.ok && !x.todo).length} failed`);
for (const r of L) console.log(`${r.status.padEnd(11)} ${r.id.padEnd(5)} ${r.what}: ${r.number}`);
const fails = L.filter((r) => r.status === 'FAIL').length;
console.log(`${L.filter((r) => r.status === 'PASS').length} PASS, ${fails} FAIL, ${L.filter((r) => /^UNMEASURED/.test(r.status)).length} UNMEASURED, ${L.filter((r) => /^RECORDED/.test(r.status)).length} RECORDED`);
if (out) writeFileSync(out, JSON.stringify({ commit, dirty, tests, lines: L }, null, 1));
process.exit(fails ? 1 : 0);
