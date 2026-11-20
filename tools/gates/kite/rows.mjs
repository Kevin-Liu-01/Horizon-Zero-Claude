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
import { groundedDownTime, KITE, createFlightBody, openAt, stepFlight } from '../../../src/game/kite/flight.js';
import { flatWorld, steadyWind, gameWind, islandLift, faceAt, fly, WORLD_LIFT } from './world.mjs';
import { flyTestFlight, flyRoad } from './glides.mjs';
import { TEST_FLIGHT, ROAD_LAUNCH } from '../../../src/game/kite/roads.js';

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
const hangF = path.join(tmp, 'hang.json'), row0F = path.join(tmp, 'row0.json'), clipF = path.join(tmp, 'clip.json');
execFileSync(process.execPath, [path.join(HERE, 'clip-bench.mjs'), '--json', clipF], { stdio: 'ignore' });
const CB = JSON.parse(readFileSync(clipF, 'utf8'));
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
{
  const k = ['open', 'fold', 'land'].map((c) => CB.rows[c].rollToStowKit_m).filter((v) => v != null), m = Math.min(...k);
  line('KF0d', 'the furled roll beside the bow: the bow and lance stowed, on the mount and every step of the open, fold and landing', m > 0 ? 'PASS' : 'FAIL', `the roll's surface >= ${m.toFixed(3)} m from the stowed kit (lance, bow, quiver; the clip bench); the mount rides outside the stowed bow and lance`);
  line('KF0d', 'the open with the bow in hand', 'UNMEASURED', 'wave 3 (the open with a weapon drawn needs combat\'s holster rule in flight: no weapon verb while flight is not none)');
}
// KF1 (the static hang, Node)
line('KF1', 'wrists in front of the head plane (static hang)', pf(H.wristsInFront.pass), `${H.wristsInFront.min_m} m`);
line('KF1', 'wrists at or below head height (static hang)', pf(H.wristsAtOrBelowHead.pass), `${H.wristsAtOrBelowHead.min_belowHeadBone_m} m under the head bone`);
line('KF1', 'elbows below the shoulder joints (static hang)', pf(H.elbowsBelowShoulders.pass), `${H.elbowsBelowShoulders.max_elbowOverShoulder_m} m (max, elbow over shoulder)`);
line('KF1', 'bar between sternum and chin', pf(H.barSternumToChin.pass), `k ${H.barSternumToChin.k}`);
line('KF1', 'bar 0.30-0.40 m in front of the chest', pf(H.barInFrontOfChest.pass), `${H.barInFrontOfChest.fromClothedChest_m} m from the clothed chest, ${H.barInFrontOfChest.fromTorsoCapsule_m} m from the torso capsule`);
{
  const c = CB.rows, n = (k) => `${c[k].steps} steps: wrists >= ${c[k].minWristFront_headFrame_m} m in front, >= ${c[k].minWristBelowHeadBone_m} m under the head bone, elbows <= ${c[k].maxElbowOverShoulder_m} m`;
  line('KF1', 'every step of open, glide, banks L/R, fold, landing, reef (R5), open from standing and airborne, fold at 3 m, the step the state turns none and her fall after an airborne fold (Node, the law driving the clips), on BOTH reads', CB.pass ? 'PASS' : 'FAIL',
    `${CB.badSteps} of ${CB.steps} steps behind the head-frame plane (through the skull centre) or over head height or an elbow over its shoulder; ${CB.facing.badSteps} of ${CB.steps} behind the head bone's vertical plane square to her facing; open ${n('open')}, facing >= ${c.open.minWristFront_facing_m} m; glide+banks ${n('glide')}; fold ${n('fold')}; landing ${n('land')}; reef ${n('reef')}; her fall after the fold ${n('after-air')}, facing >= ${c['after-air'].minWristFront_facing_m} m`);
  {
    const H2 = CB.handBackOnGround;
    line('KF1', "the hand-back on the ground (after touchdown, until the kite's layer is off): no wrist further behind either plane than her own pose's, none behind at head height (within 0.30 m of the head bone), no elbow over its shoulder", H2.pass ? 'PASS' : 'FAIL',
      `${H2.bad} of ${H2.steps} steps fail; ${H2.stepsBehindAPlane} steps have a wrist behind a plane, every one >= 0.30 m under the head bone and no further behind than her own pose (worst ${H2.worst.frontFacing} m on the facing read at ${H2.worst.belowHead} m under the head bone; her own pose there ${H2.worst.ownFacing} m); ${H2.ownPoseStepsNotKite} steps after the layer is off are her own pose (not graded)`);
  }
  line('KF1', 'interrupts: hit in the air, open at the limit', 'UNMEASURED', 'wave 3 (a hit reaction in the air needs the page flight); the open at 0.35 s / 3 m is the law\'s (KF4)');
}
// KF2-KF8 (Node)
{
  // (fix round 1, the judge's FIX LIST 11: the measured band numbers, not "tests pass"; the same stepped glide as the
  //  test file's, 40 s from high over flat ground)
  const glide = (world, headingDeg, seconds = 40) => {
    const f = createFlightBody(); let st = openAt(f, { x: 0, y: 2000, z: 0, headingDeg, groundY: 0 });
    while (st !== 'gliding') st = stepFlight(st, f, {}, world, 1 / 60);
    const x0 = f.x, z0 = f.z, y0 = f.y;
    for (let i = 0; i < seconds * 60; i++) st = stepFlight(st, f, {}, world, 1 / 60);
    const d = Math.hypot(f.x - x0, f.z - z0), h = y0 - f.y;
    return { ratio: d / h, ground: d / seconds, sink: h / seconds };
  };
  const still = glide(flatWorld({ windAt: steadyWind(0) }), 90), tw = flatWorld({ windAt: steadyWind(5.5, 45) });
  const dn = glide(tw, 225), up = glide(tw, 45), gw = gameWind();
  const gdn = glide(flatWorld({ windAt: gw.windAt }), 225), gup = glide(flatWorld({ windAt: gw.windAt }), 45);
  const f2 = (v) => v.toFixed(2);
  line('KF2', 'still air 7.5 +-0.2 / 1.5 +-0.1 / 5:1 +-0.3; downwind 6.5:1 +-0.4, upwind 3.5:1 +-0.3', pf(allOk(/^KF2 /)),
    `still air ${f2(still.ground)} m/s forward, ${f2(still.sink)} m/s sink, ${f2(still.ratio)}:1; the trade 5.5 m/s from 045: downwind ${f2(dn.ratio)}:1, upwind ${f2(up.ratio)}:1; on the environment's own wind: downwind ${f2(gdn.ratio)}:1, upwind ${f2(gup.ratio)}:1`);
  // KF3: the island sampled every 8 m at 5 m over the ground (the test's grid), and the cap in steady 1.5 m/s lift
  const R = (a) => a * Math.PI / 180, from = { x: Math.sin(R(45)), z: -Math.cos(R(45)) };
  const fc = { h: 0, slopeDeg: 0, aspect: { x: 0, z: 0 }, sea: false };
  let nL = 0, lo = Infinity, hi = -Infinity, minSlope = Infinity, nonzero = { flat: 0, gentle: 0, lee: 0, sea: 0, high: 0 }, n = { flat: 0, gentle: 0, lee: 0, sea: 0 };
  for (let x = -480; x <= 480; x += 8) for (let z = -480; z <= 480; z += 8) {
    faceAt(x, z, fc); const v = islandLift(x, fc.h + 5, z);
    if (v > 0) { nL++; lo = Math.min(lo, v); hi = Math.max(hi, v); minSlope = Math.min(minSlope, fc.slopeDeg); if (islandLift(x, fc.h + 41, z) > 0) nonzero.high++; }
    const k = fc.sea ? 'sea' : fc.slopeDeg < 2 ? 'flat' : fc.slopeDeg < 25 ? 'gentle' : (fc.aspect.x * from.x + fc.aspect.z * from.z < 0 ? 'lee' : null);
    if (k) { n[k]++; if (v > 0) nonzero[k]++; }
  }
  const cap = fly(flatWorld({ liftAt: () => 1.5 }), { x: 0, y: 40, z: 0, headingDeg: 0, maxS: 90 });
  line('KF3', 'lift +0.5 to +1.5 m/s on windward faces >= 25 deg within 40 m below; never above launch + 25 m; 0 over flat, water, lee', pf(allOk(/^KF3 /)),
    `${nL} lifting cells, ${lo.toFixed(2)}-${hi.toFixed(2)} m/s (band ${WORLD_LIFT.min}-${WORLD_LIFT.max}), slope >= ${minSlope.toFixed(1)} deg; non-zero over flat ${nonzero.flat}/${n.flat}, water ${nonzero.sea}/${n.sea}, lee ${nonzero.lee}/${n.lee}, gentler faces ${nonzero.gentle}/${n.gentle}, 41 m up ${nonzero.high}/${nL}; the cap: launch 40 m, highest ${cap.maxY.toFixed(2)} m (bar 65)`);
}
line('KF4', 'open only >= 0.35 s and >= 3 m; open 400-600 ms; fold <= 400 ms', pf(allOk(/^KF4 /)), `open ${KITE.openS * 1000} ms, fold ${KITE.foldS * 1000} ms (the law's times)`);
line('KF4', 'the clips run on the law\'s times', 'PASS', 'kiteClips.js CLIP_S open 0.5 s, fold 0.35 s, landing 0.4 s = flight.js KITE (clip-bench.mjs throws otherwise)');
line('KF4', "the roll's hand-off obeys W1's wrist bar (0.08 m a step outside a swing)", CB.wristStep.over === 0 ? 'PASS' : 'FAIL', `${CB.wristStep.over} hand-steps over 0.08 m; the most ${CB.wristStep.max_m} m (${CB.wristStep.at?.clip} at ${CB.wristStep.at?.phase}, ${CB.wristStep.at?.scenario})`);
line('KF4', "the roll's hand-off obeys W1's palm bar (the palm 0.010 m or less off the grip's centreline while a hand holds the bar)", CB.palmOnGrip.max_m <= 0.010 ? 'PASS' : 'FAIL', `${['open', 'glide', 'fold', 'land', 'reef'].map((k) => `${k} p50 ${CB.rows[k].palmToGrip?.p50} / max ${CB.rows[k].palmToGrip?.max} m (${CB.rows[k].palmToGrip?.over010} of ${CB.rows[k].palmToGrip?.n} over)`).join('; ')}`);
line('KF4', "W1's palm normal, fingertip and wrist deviation bars on the bar; the open and fold through handling.js", 'UNMEASURED', 'D3 is open (the M3 brief: through handling.js only once D3 closes); the kiteBar slot is typed in src/hero/sockets.js');
line('KF5', 'calima and squall: 0 of 10 opens, a field note in the bible\'s words', pf(allOk(/^KF5 grounded: /)), 'GROUNDED_NOTE from BIBLE §3.2 and §16');
line('KF5', '(old text, superseded by R5) a kite already open when calima arrives is brought down inside 5 s* without damage', 'RULED', `wave 1: 5 s met to 80 m; 200 m 9.9 s, 275 m 13.1 s FAILED; R5 restates it (the three lines below)`);
line('KF5', '(R5) calima or squall forces the fold within 1 s at any height', pf(allOk(/^KF5 \(R5\) calima or squall forces/)), `the fold on the step the weather is read (${(1000 / 60).toFixed(1)} ms), 3-275 m, from the glide and from the open, calima and squall (bar ${KITE.forcedFoldS} s)`);
line('KF5', '(R5) from 80 m or lower on the ground within 5 s', pf(allOk(/^KF5 \(R5\) from 80 m/)), `${[60, 70, 80].map((h) => `${h} m ${groundedDownTime(h).toFixed(2)} s`).join(', ')} (closed form; stepped within 0.12 s), undamaged`);
line('KF5', "(R5) from higher at the law's safe sink (no free fall)", pf(allOk(/^KF5 \(R5\) from higher/)), `${[200, 275].map((h) => `${h} m ${groundedDownTime(h).toFixed(1)} s`).join(', ')}; sink <= ${KITE.downMaxVs} m/s, down-acceleration ${KITE.downAcc} m/s^2 < g ${KITE.gravity}, touchdown <= ${KITE.safeLandVs} m/s, 0 damage`);
line('KF6', '<= 3 m/s: 0 damage; above: the fall rule', pf(allOk(/^KF6 landing/)), 'flight-law.test.mjs');
line('KF6', 'no landing past the 1.1 m contour (her final place)', pf(allOk(/^KF6 (no landing|the current|on the island)/)), 'shore fixtures and the black-sand beach: she stands at <= 1.1 m');
line('KF6', 'feet planted within 2 steps, foot rows unchanged', 'UNMEASURED', 'wave 3: the landing clip on the page (tools/gates/hero-sweep/kite-*.mjs)');
line('KF7', '5, 7, 6 posts of 3 m; cloth streams iff liftAt > 0 at the top', pf(allOk(/^KF7 the (wind roads|cloth)/)), 'a fixture with known answers');
line('KF7', '(old text, superseded by R4 for two roads) the cloth streams iff liftAt > 0 at the post; the first two flown end to end by the driver 10 of 10', 'RULED', 'wave 1: Organ Shelf 0/5 and Scar 0/7 stream on lift (FAILED); caldera 6/6');
for (const road of ['organ-shelf', 'scar']) {
  const rr = [...Array(10).keys()].map((k) => flyRoad(road, k)), ok = T(new RegExp(`^KF7 \\(R4\\) the ${road === 'scar' ? 'Scar' : 'Organ Shelf'} road`))[0];
  line('KF7', `(R4) ${road}: a glide along the posts from the road's launch (${ROAD_LAUNCH[road]}) reaches its last post`, ok && ok.ok ? 'PASS' : 'FAIL',
    `${rr.filter((r) => r.end === 'last post reached').length}/10; at the last post ${Math.min(...rr.map((r) => r.passed.at(-1)?.agl ?? 0)).toFixed(1)}-${Math.max(...rr.map((r) => r.passed.at(-1)?.agl ?? 0)).toFixed(1)} m over its foot; the lowest over any post ${Math.min(...rr.flatMap((r) => r.passed.map((p) => p.agl))).toFixed(1)} m`);
}
for (const x of T(/^KF7 the caldera/)) line('KF7', x.name.replace(/^KF7 /, ''), x.ok ? 'PASS' : 'FAIL', 'stream on lift');
line('KF7', 'the first two roads flown end to end by the PAGE driver, 10 of 10', 'UNMEASURED', 'wave 3 (the page driver); Node flies them by the law: the R4 lines above');
{
  const tt = [...Array(10).keys()].map((k) => flyTestFlight(k)), ok = T(/^T1 \(R3\)/)[0];
  line('T1', `(R3) the test flight: open at T1, glide, land on the marked field (r ${TEST_FLIGHT.field.r} m at ${TEST_FLIGHT.field.e}, ${TEST_FLIGHT.field.n})`, ok && ok.ok ? 'PASS' : 'FAIL',
    `${tt.filter((r) => r.fromCentreM <= TEST_FLIGHT.field.r).length}/10 inside; ${Math.min(...tt.map((r) => r.fromCentreM)).toFixed(2)}-${Math.max(...tt.map((r) => r.fromCentreM)).toFixed(2)} m from its centre; touchdown <= ${Math.max(...tt.map((r) => r.landVs)).toFixed(2)} m/s, 0 damage, dry; ${tt[0].t} s from the open`);
}
line('KF8', 'sight x2.0 gliding, x1.0 the step she lands; no weapon verb unless none', pf(allOk(/^KF8 /)), 'the seam: flight.js sightRangeMul (gliding only, as area C reads it), weaponVerbsAllowed; combat reads it at wave 3');
line('KF9', 'the budget: <= 6 k tris, 1 draw', pf(H.kiteBudget.pass), `${H.kiteBudget.triangles} triangles, ${H.kiteBudget.draws} draw (src/entities/anim/kite/surveyKite.js, vertex colours, built from code: 0 bytes shipped)`);
line('KF9', 'the look on the page (F51, F52): two rectangular cells, at least 6 spars countable, the leading cell orchil, never a triangular or membrane wing', 'UNMEASURED', 'graded on the filmed frames (the fix-round film); this summary has no page');
line('KF9', 'a 512 set; the read-out', 'UNMEASURED', 'no texture this wave (vertex colours: 0 MB of the 2 MB line); the read-out is wave 3 (src/ui/kiteread.js)');
line('KF10', 'cloth in flight', 'UNMEASURED', 'wave 3');
line('KF11', 'cost in flight', 'UNMEASURED here', "F51 at blockout by tools/perf/attrib.mjs (the M0.8 back-to-back readback), at a commit; the 60 s glide: wave 3");

const commit = git('rev-parse', '--short', 'HEAD'), dirty = (git('status', '--porcelain', '--untracked-files=no') || '').length > 0;
console.log(`area B rows at ${commit}${dirty ? ' (TREE DIRTY: not a result)' : ' (clean tree)'}; node --test: ${tests.filter((x) => x.ok).length} ok, ${tests.filter((x) => x.todo).length} todo (FAIL), ${tests.filter((x) => !x.ok && !x.todo).length} failed`);
for (const r of L) console.log(`${r.status.padEnd(11)} ${r.id.padEnd(5)} ${r.what}: ${r.number}`);
const fails = L.filter((r) => r.status === 'FAIL').length;
console.log(`${L.filter((r) => r.status === 'PASS').length} PASS, ${fails} FAIL, ${L.filter((r) => /^UNMEASURED/.test(r.status)).length} UNMEASURED, ${L.filter((r) => /^RECORDED/.test(r.status)).length} RECORDED, ${L.filter((r) => /^RULED/.test(r.status)).length} RULED (old text kept), ${L.filter((r) => /^READ/.test(r.status)).length} READ`);
if (out) writeFileSync(out, JSON.stringify({ commit, dirty, tests, lines: L }, null, 1));
process.exit(fails ? 1 : 0);
