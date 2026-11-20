/**
 * M3 wave 1, area C: ROW 0 (IK0 of the M3 brief), recorded in Node. Geometry, time and rule questions about the four
 * kinds against what the tree has today. Prints one JSON record (numbers, and UNMEASURED with why where the tree
 * cannot answer yet).
 *
 *   node tools/gates/instruments/m3/row0.mjs
 *
 * `at` is the commit the numbers were taken at and whether the tree was clean (the measurement rule: a number names its
 * commit; a dirty tree's numbers are not a commit's).
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KilnBrain } from '../../../../src/instruments/kinds/kiln/rules.js';
import { lensCheck, arrowCheck, mooringPost } from './sonde-mooring.mjs';
import { WELLHEADS, APRON, YARDS } from '../../../../src/world/sites/kilnyards-layout.js';
import { KILN_ROSTER } from '../../../../src/instruments/kinds/kiln/form.js';
import { KILN_RULES, planVolley, rng } from '../../../../src/instruments/kinds/kiln/rules.js';
import { SpindleThrust, SPINDLE_RULES } from '../../../../src/instruments/kinds/spindle/rules.js';
import { SONDE_RULES, SondeBrain } from '../../../../src/instruments/kinds/sonde/rules.js';
import { WindwallState, WINDWALL } from '../../../../src/combat/windwall.js';
import { encounterVerdict } from '../../../../src/instruments/lib/sizeclass.js';

const r2 = (v) => +v.toFixed(2);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return null; } };
const dirtyPaths = (git('status', '--porcelain', '--untracked-files=no') || '').split('\n').filter(Boolean);
const out = { row: 'IK0', at: { commit: git('rev-parse', '--short', 'HEAD'), dirty: dirtyPaths.length > 0, dirtyPaths: dirtyPaths.slice(0, 12), tree: REPO, utc: new Date().toISOString() } };

/* 1. the Kiln at a wellhead, and two on one apron (area A's seam: src/world/sites/kilnyards-layout.js) */
const footR = Math.hypot(KILN_ROSTER.L / 2, KILN_ROSTER.W / 2);
const W = WELLHEADS;
{
  // each stand as the seam keeps it: a 5.0 x 3.4 box at kilnStand, its length along the bench (u); two Kilns side by side
  const st = W.map((w) => w.kilnStand);
  const gaps = [];
  for (let i = 0; i + 1 < st.length; i++) gaps.push(r2(Math.hypot(st[i + 1].x - st[i].x, st[i + 1].z - st[i].z) - 2 * st[i].halfLen));
  const toWell = W.map((w) => r2(Math.hypot(w.kilnStand.x - w.x, w.kilnStand.z - w.z)));
  out.kilnAtWellhead = {
    apron: { lenM: APRON.halfLen * 2, widM: APRON.halfWid * 2, h: APRON.h }, wellsApartM: W.slice(1).map((w, i) => r2(Math.hypot(w.x - W[i].x, w.z - W[i].z))),
    standToWellM: toWell, seamHoseM: W[0].kilnStand.hose, gapBetweenNeighbourKilnsM: gaps, twoOnOneApron: gaps.every((g) => g >= 1),
  };
  // the hose on the well: a Kiln walked to each stand by its own rules, its coupling (low on its right flank since the
  // fix round) to the wellhead's centre, level, against the seam's 3.2 m run
  out.kilnAtWellhead.couplingToWellheadM = W.map((w) => {
    const k = new KilnBrain({ x: w.kilnStand.x + 12, z: w.kilnStand.z + 9, heading: 1 });
    const one = [{ ...w, state: 'hot', plugged: null }];
    for (let t = 0; t < 90 && !k.plugged; t += 1 / 60) k.step(1 / 60, { wellheads: one });
    const c = k.couplingWorld();
    return { id: w.id, plugged: k.plugged, m: r2(Math.hypot(c.x - w.x, c.z - w.z)) };
  });
  out.kilnAtWellhead.hoseBarM = W[0].kilnStand.hose;
}

/* 2. the mortar's 25-60 m against the Yards */
const R = rng(1);
{
  let inBand = 0, under = 0, n = 0;
  for (let i = 0; i < 20000; i++) {
    // a point on the apron (its own frame), from the second wellhead
    const u = (R() * 2 - 1) * APRON.halfLen, v = (R() * 2 - 1) * APRON.halfWid;
    const d0 = Math.hypot(u - (-5), v - (-3));
    n++;
    if (d0 < KILN_RULES.mortar.minR) under++; else if (d0 <= KILN_RULES.mortar.maxR) inBand++;
  }
  const towers = YARDS.towers.map((t) => ({ id: t.id, fromWh2M: r2(Math.hypot(t.x - W[1].x, t.z - W[1].z)) }));
  out.mortar = {
    fromPluggedStand: planVolley({ x: 0, z: 0 }, { x: 40, z: 0 }, {}, R, { plugged: true }).why,
    apronShareFromWh2: { underMinR: r2(under / n), inBand: r2(inBand / n) }, towers,
    note: 'on the apron she is inside the 25 m minimum of any wellhead: a Kiln at its well cannot shell her there; the band covers the approaches, the shelf and the towers. Sightlines past the stubs are not modelled (the mortar lobs).',
  };
}

/* 3. the Spindle's thrust against the Windwall's guard (KT9's scripted source, replaced by the kind's own thrust) */
{
  const D = SPINDLE_RULES.thrustDmg, me = { x: 0, z: 0, heading: 0 };
  const T = new SpindleThrust(), ww = new WindwallState(); ww.owned = true;
  const starts = [0, 2.2, 4.4];
  let taken = 0, parries = 0, blocks = 0, hits = 0, hitT = [];
  let ti = 0;
  for (let i = 0, t = 0; i < 7 * 60; i++, t = i / 60) {
    if (ti < starts.length && t >= starts[ti] - 1e-9 && !T.busy) { T.start(0, 8.6, Math.PI); ti++; }
    const last = starts[Math.max(0, ti - 1)];
    // KT9's reaction: she raises the guard 0.25 s into the wind-up and lets it down 0.3 s after the hit window
    ww.guard(T.busy && t - last >= 0.25);
    ww.step(1 / 60, { ...me, y: 0 });
    T.step(1 / 60);
    if (T.struck(me.x, me.z, 0.3)) {
      hits++; hitT.push(r2(t - last));
      const b = T.body(), r = ww.block({ x: b.x, z: b.z }, me);
      if (r === 'parry') parries++; else if (r === 'block') { blocks++; taken += D * WINDWALL.blockK; } else taken += D;
    }
  }
  out.spindleThrustVsWindwall = { from: 8.6, thrusts: starts.length, hits, hitAfterWindupStartS: hitT, parries, blocks, damageLessPct: r2(100 * (1 - taken / (hits * D))),
    note: 'KT9 (src/combat/kit-m2.test.mjs) hit at 0.6 s from 2.5 m; the kind\'s thrust lands after the wind-up and the dash, past the parry window: the guard blocks it' };
}

/* 4. the Sonde's tether at the Sounding Ring */
{
  const S = new SondeBrain({ post: { x: 0, y: 0, z: 0 } });
  for (let t = 0; t < 60; t += 1 / 60) S.step(1 / 60, { wind: { speed: 5, fromDeg: 45 }, groundY: () => 0 });
  out.sondeAtRing = {
    tetherM: SONDE_RULES.tetherM, mooredInTradeKeelOverShackleM: r2(S.keelY() - S.shackle().y), tetherRunM: r2(S.tetherDist()), leanM: r2(Math.hypot(S.keel().x - S.post.x, S.keel().z - S.post.z)), ringAcrossM: 34, riseM: '5-6',
    cutPoint: 'the shackle on the post, 1.3 m over the rise: cut by hand at the post, or the tether shot through anywhere below the gondola',
  };
  // the post (SONDE_MOORING) against every probed lens, and the bow from the rise (ArrowPool.predict): ./sonde-mooring.mjs
  const L = lensCheck(), B = await arrowCheck();
  out.sondeAtRing.post = mooringPost();
  out.sondeAtRing.postInAcceptedLens = { sweptVolume: `half-sphere r ${L.sweptR} m round the shackle (tether 18 + hull 2.8) and the post`, lensesChecked: L.lensesChecked,
    acceptedLensesSeeingIt: L.acceptedSeeing, seenBy: L.seenBy, clearOf: L.clearOf, unmeasuredNoProbe: L.unmeasuredNoProbe,
    verdict: L.acceptedSeeing.length ? `IN ${L.acceptedSeeing.length} accepted lenses (${L.acceptedSeeing.join(', ')}): the Ring itself is in them, so no post at the Ring keeps it out by placement; it is masked by its swept volume (area A's skyline-masks row: centre the shackle, r ${L.sweptR} m)` : 'in no probed accepted lens' };
  out.sondeAtRing.arrowFromRise = { via: 'ArrowPool.predict (src/combat/arrows.js) over the island bake, bow 1.45 m over the ground, arrow 62 m/s', shots: B.shots, reached: B.reached, worstMissM: B.worstMissM, notReached: B.notReached, note: B.note };
}

/* 5. the encounter at the Yards (Q4's default: two Kilns, one awake; one Spindle; a Davit from the third wellhead) */
{
  const cls = { kiln: 'large', spindle: 'medium', davit: 'medium' };
  const members = [{ kind: 'kiln', x: W[0].kilnStand.x, z: W[0].kilnStand.z }, { kind: 'kiln', x: W[3].kilnStand.x, z: W[3].kilnStand.z }, { kind: 'spindle', x: W[0].x + 7, z: W[0].z }, { kind: 'davit', x: W[0].x - 20, z: W[0].z }];
  const v = encounterVerdict(members, (k) => cls[k]);
  const far = Math.hypot(W[0].kilnStand.x - W[3].kilnStand.x, W[0].kilnStand.z - W[3].kilnStand.z);
  // the three ways out, measured (the ruling is the orchestrator's): (a) a plugged, still Kiln is not counted; (b) the
  // second Kiln stands > 60 m off; (c) one Kiln at the Yards
  const stands = W.map((w) => w.kilnStand);
  let maxApart = 0; for (const a of stands) for (const b of stands) maxApart = Math.max(maxApart, Math.hypot(a.x - b.x, a.z - b.z));
  const vA = encounterVerdict(members.filter((m, i) => i !== 1), (k) => cls[k]);
  const vC = encounterVerdict(members.filter((m, i) => i !== 1), (k) => cls[k]);
  out.encounterQ4 = { ok: v.ok, why: v.anchors.flatMap((a) => a.why), kilnsApartM: r2(far), radiusM: 60,
    options: {
      a_pluggedStillNotCounted: { ok: vA.ok, why: vA.anchors.flatMap((q) => q.why), needs: 'a rule change in src/instruments/lib/sizeclass.js (instruments-core) to skip a plugged, still Kiln' },
      b_secondKilnOver60m: { possibleAtTheWellheads: maxApart > 60, farthestTwoStandsM: r2(maxApart), needs: 'the second Kiln off the apron (not plugged in), which Q4\'s default does not describe' },
      c_oneKilnAtTheYards: { ok: vC.ok, why: vC.anchors.flatMap((q) => q.why), needs: 'KILN_RULES.cap 2 -> 1' },
    },
    finding: 'two Kilns on one apron are 2 large within 60 m: the encounter rule fails Q4\'s default. NEEDS AN ORCHESTRATOR RULING (a or c pass; b is impossible at the wellheads) before F59 or IK10 can be staged' };
}

console.log(JSON.stringify(out, null, 1));
process.exit(0);
