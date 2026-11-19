/**
 * IN5, IN6, IN7 (the Screed) and IN8 (the Sickle): the Node twins of the rules (M2 briefs §6), browser-free:
 *   node --test tools/instruments/screed-rules.test.mjs
 * The walls are a stand-in with ninewalls-layout.js's own API (segmentHitsWall, setWallCut, wallState) over three
 * concentric crescents, because area B's WALLS is empty at the seam commit; when it holds walls, IN7's twin runs on
 * them too (the last test).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentHit } from '../../src/instruments/lib/sight.js';
import { ScreedBrain, SCREED_RULES, makeParts, hitPart, bladeDropped } from '../../src/instruments/kinds/screed-rules.js';
import { SickleBrain, SICKLE_RULES, circlePos } from '../../src/instruments/kinds/sickle-rules.js';
import * as NW from '../../src/world/settlements/ninewalls-layout.js';

const DT = 1 / 60, D2R = Math.PI / 180;

/** Three crescents about (0, 0), radii 60/52/44 m, facing NE (compass 0-180), 0.7 m thick, 2.4 m high, on the seam's API. */
function standInWalls() {
  const W = [60, 52, 44].map((r, i) => ({ id: `wall-${i + 1}`, order: i + 1, c: { x: 0, z: 0 }, r, from: 0, to: 180, t: 0.7, h: 2.4, lineH: 1.1, lineW: 0.25 }));
  const cut = new Set();
  // compass bearing (0 N, 90 E) in the engine frame (x = E, z = -N) -> sight.js bearing atan2(dx, dz): b_sight = pi - compass
  const arcOf = (w) => ({ type: 'arc', cx: w.c.x, cz: w.c.z, r: w.r, thick: w.t, a0: Math.PI - w.to * D2R, a1: Math.PI - w.from * D2R, y0: 0, y1: cut.has(w.id) ? w.lineH : w.h });
  return {
    W, cut,
    segmentHitsWall(ax, az, bx, bz) {
      let best = null;
      for (const w of W) {
        if (cut.has(w.id)) continue;    // a cut wall stands to the line: the blade at its working height passes over it
        const t = segmentHit(arcOf(w), ax, 0.5, az, bx, 0.5, bz);
        if (t >= 0 && (!best || t < best.t)) best = { id: w.id, t, x: ax + (bx - ax) * t, z: az + (bz - az) * t };
      }
      return best;
    },
    setWallCut(id) { cut.add(id); },
    wallState(id) { return cut.has(id) ? 'cut' : 'whole'; },
  };
}

function runCharge(b, maxS = 8) {
  let windupPeak = 0, headingDev = 0, stallStart = null, stallEnd = null, t = 0;
  while (t < maxS) {
    const was = b.phase;
    b.step(DT); t += DT;
    if (b.phase === 'windup' || was === 'windup') windupPeak = Math.max(windupPeak, b.bladeY);
    if (b.phase === 'charge' && b.lockedHeading !== null) {
      let d = b.heading - b.lockedHeading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      headingDev = Math.max(headingDev, Math.abs(d) / D2R);
    }
    if (b.phase === 'stall' && stallStart === null) stallStart = t;
    if (was === 'stall' && b.phase !== 'stall' && stallEnd === null) stallEnd = t;
    if (b.phase === 'walk' && was === 'charge') break;
    if (stallEnd !== null) break;
  }
  return { windupPeak, headingDev, stallS: stallStart !== null && stallEnd !== null ? stallEnd - stallStart : null, charged: b.charged, stalls: b.stalls };
}

test('IN5: an open charge holds its heading over 25 m with the blade at 2.6 m in the wind-up, and levels the reed under the blade', () => {
  const levelled = [];
  const b = new ScreedBrain({ x: 0, z: 0, reed: { level: (x, z, r) => levelled.push([x, z, r]) } });
  b.charge(10, 30);
  const r = runCharge(b);
  console.log('IN5 open', JSON.stringify({ windupPeak: r.windupPeak, headingDevDeg: r.headingDev, chargedM: +r.charged.toFixed(2), levelled: levelled.length }));
  assert.ok(Math.abs(r.windupPeak - 2.6) < 1e-9);
  assert.ok(r.headingDev < 3);
  assert.ok(Math.abs(r.charged - 25) < 1e-6);
  assert.ok(levelled.length > 0);
  // every levelled point lies on the blade's swept band: within the blade's half-width of the charge line
  const h = Math.atan2(10, 30), s = Math.sin(h), c = Math.cos(h);
  for (const [x, z] of levelled) assert.ok(Math.abs(x * c - z * s) <= SCREED_RULES.bladeHalfW + 1e-6);
});

test('IN5: a charge into a wall arc, a basalt cluster and the Organ Shelf stalls it for 3.0 s +-0.2', () => {
  const walls = standInWalls();
  const cases = [
    { by: 'wall', b: new ScreedBrain({ x: 20, z: -75, walls }), at: [0, -50] },
    { by: 'basalt', b: new ScreedBrain({ x: 0, z: 0, obstacles: [{ id: 'basalt-1', shape: { type: 'cyl', cx: 0, cz: 15, r: 2.2, y0: 0, y1: 6 } }] }), at: [0, 30] },
    { by: 'shelf', b: new ScreedBrain({ x: 0, z: 0, obstacles: [{ id: 'organ-shelf', shape: { type: 'box', cx: 0, cy: 3, cz: 18, hx: 12, hy: 3, hz: 1.5, yaw: 0 } }] }), at: [0, 30] },
  ];
  for (const k of cases) {
    k.b.charge(k.at[0], k.at[1]);
    const r = runCharge(k.b);
    console.log('IN5 stall', k.by, JSON.stringify({ stallS: r.stallS && +r.stallS.toFixed(3), headingDevDeg: r.headingDev, chargedM: +r.charged.toFixed(2), stalls: r.stalls }));
    assert.equal(r.stalls.length, 1, k.by);
    assert.ok(Math.abs(r.stallS - 3.0) <= 0.2, `${k.by} stall ${r.stallS}`);
    assert.ok(r.headingDev < 3);
    assert.ok(r.charged < 25);
  }
});

test('IN6: the parts: two ram seals and the cab lamp; both seals off drops the blade; a seized seal comes off with one Pry or one hook-rip', () => {
  const p = makeParts();
  assert.deepEqual(Object.keys(p).sort(), ['lamp', 'sealL', 'sealR']);
  assert.equal(hitPart(p, 'sealL', 'brine'), 'seized');
  assert.equal(hitPart(p, 'sealL', 'pry'), 'off');
  assert.equal(bladeDropped(p), false);
  assert.equal(hitPart(p, 'sealR', 'brine'), 'seized');
  assert.equal(hitPart(p, 'sealR', 'hookRip'), 'off');
  assert.equal(bladeDropped(p), true);
  const q = makeParts();
  assert.equal(hitPart(q, 'sealL', 'pry'), 'sealed');           // a sealed seal does not tear off with a Pry
  assert.equal(hitPart(q, 'sealL', 'precision'), 'sealed');
  assert.equal(hitPart(q, 'sealL', 'precision'), 'off');        // two precision hits break it
  assert.equal(hitPart(q, 'lamp', 'brine'), 'sealed');
  assert.equal(hitPart(q, 'lamp', 'precision'), 'off');
  // a Screed whose seals are off cuts no wall: it walks into the outer wall and stops there
  const walls = standInWalls();
  const b = new ScreedBrain({ x: 30, z: -80, walls });
  b.parts.sealL.state = 'off'; b.parts.sealR.state = 'off';
  b.target = { x: 0, z: 0 };
  for (let i = 0; i < 60 * 90; i++) b.step(DT);
  console.log('IN6 dropped blade', JSON.stringify({ cuts: b.cuts, bladeY: b.bladeY, at: [+b.x.toFixed(1), +b.z.toFixed(1)] }));
  assert.equal(b.cuts.length, 0);
  assert.equal(b.bladeY, SCREED_RULES.bladeDrop);
});

test('IN7: walking in un-stalled it cuts each wall it reaches down to the line; at the third the fight ends fail-soft and it walks on', () => {
  const walls = standInWalls();
  const b = new ScreedBrain({ x: 30, z: -80, walls });
  b.target = { x: 0, z: 0 };
  let t = 0;
  while (t < 120 && !b.failSoft) { b.step(DT); t += DT; }
  const at = [b.x, b.z];
  b.target = { x: -60, z: 60 };                         // the Scar beyond: it walks on
  for (let i = 0; i < 60 * 10; i++) b.step(DT);
  const walked = Math.hypot(b.x - at[0], b.z - at[1]);
  console.log('IN7', JSON.stringify({ cuts: b.cuts, log: b.log, failSoft: b.failSoft, walkedOnM: +walked.toFixed(1), states: walls.W.map((w) => walls.wallState(w.id)) }));
  assert.deepEqual(b.cuts, ['wall-1', 'wall-2', 'wall-3']);
  assert.ok(b.failSoft);
  assert.ok(walked > 10);
  assert.deepEqual(walls.W.map((w) => walls.wallState(w.id)), ['cut', 'cut', 'cut']);
});

test('IN7 on area B\'s walls, when ninewalls-layout.js has them', { skip: !NW.WALLS.length && 'ninewalls-layout.js WALLS is empty at this tree' }, () => {
  const outer = [...NW.WALLS].sort((a, b) => a.order - b.order)[0];
  const mid = (outer.from + ((outer.to - outer.from + 360) % 360) / 2) * D2R;
  const sx = outer.c.x + Math.sin(mid) * (outer.r + 25), sz = outer.c.z - Math.cos(mid) * (outer.r + 25);
  const b = new ScreedBrain({ x: sx, z: sz, walls: NW });
  b.target = { x: outer.c.x, z: outer.c.z };
  let t = 0;
  while (t < 180 && !b.failSoft) { b.step(DT); t += DT; }
  console.log('IN7 area B walls', JSON.stringify({ cuts: b.cuts, failSoft: b.failSoft }));
  assert.equal(b.cuts.length, 3);
});

test('IN8: a pack of 2-3 circles at 9-14 m; the hub bearing takes 8+ of 10 scripted shots in the 0.6 s Clearcut wind-up and 0 of 10 outside it; the Scissor Lunge reaches 8 m', () => {
  for (const n of [2, 3]) {
    let rMin = 1e9, rMax = 0;
    for (let i = 0; i < n; i++) for (let t = 0; t < 30; t += DT) { const p = circlePos(i, n, t, 0, 0); if (!p.feint) { rMin = Math.min(rMin, p.r); rMax = Math.max(rMax, p.r); } }
    console.log('IN8 pack', n, JSON.stringify({ ringMinM: +rMin.toFixed(2), ringMaxM: +rMax.toFixed(2) }));
    assert.ok(rMin >= SICKLE_RULES.ringMin && rMax <= SICKLE_RULES.ringMax);
  }
  // scripted shots: an archer 10 m ahead of the hub aims at the bearing; the aim scatters (deterministic, sigma 0.09 m)
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const shots = (inWindow) => {
    let hits = 0;
    for (let k = 0; k < 10; k++) {
      const s = new SickleBrain({ x: 0, z: 0, heading: 0 });
      if (inWindow) { s.clearcut(); const until = (0.05 + 0.5 * (k / 9)); for (let t = 0; t < until; t += DT) s.step(DT); }
      else if (k % 2) { s.clearcut(); for (let t = 0; t < 0.6 + 0.1 + 0.08 * k; t += DT) s.step(DT); }   // the spin and after
      const h = s.hubWorld();
      const ax = h.x, ay = 1.45, az = h.z + 10;
      const ex = h.x + gauss() * 0.09, ey = h.y + gauss() * 0.09;
      if (s.shotHits(ax, ay, az, ex + (ex - ax) * 0.2, ey + (ey - ay) * 0.2, h.z - 2)) hits++;
    }
    return hits;
  };
  const hitIn = shots(true), hitOut = shots(false);
  const l = new SickleBrain({ x: 0, z: 0 });
  l.lunge(30 * D2R);
  for (let t = 0; t < 2; t += DT) l.step(DT);
  const reach = Math.hypot(l.x, l.z);
  console.log('IN8 hub and lunge', JSON.stringify({ hitsInWindow: hitIn, hitsOutside: hitOut, lungeReachM: +reach.toFixed(3) }));
  assert.ok(hitIn >= 8, `in window ${hitIn}`);
  assert.equal(hitOut, 0);
  assert.ok(Math.abs(reach - 8) < 1e-6);
});
