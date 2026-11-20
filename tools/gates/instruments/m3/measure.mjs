/**
 * M3 wave 1, area C: the measurements behind rows IK1-IK7 of the M3 brief, in Node on the game's own modules (rule 21:
 * a twin imports the game's module, never a copy of its law). The rows (./rows.test.mjs) grade these; ./report.mjs
 * prints them. Sim time at 60 Hz unless a row says otherwise. Every function returns { ok, ...numbers, why }.
 */
import { M3_FORMS, M3_KINDS, boundsOf, expandParts, lampsOf } from './forms.mjs';
import { KilnBrain, KilnSpawner, KILN_RULES, chooseWellhead, planVolley, rng, bodyToWorld } from '../../../../src/instruments/kinds/kiln/rules.js';
import { KILN_DOOR } from '../../../../src/instruments/kinds/kiln/form.js';
import { SpindleRing, SpindleThrust, SpindleEscort, SPINDLE_RULES } from '../../../../src/instruments/kinds/spindle/rules.js';
import { DavitBrain, DAVIT_RULES } from '../../../../src/instruments/kinds/davit/rules.js';
import { SondeBrain, SONDE_RULES, downwind, bearingOf, sondeSightM } from '../../../../src/instruments/kinds/sonde/rules.js';
import { reseat } from '../../../../src/instruments/lib/kindkit.js';
import { ST, STATUS, StatusBook } from '../../../../src/combat/status.js';
import { PotField, POTS } from '../../../../src/combat/pots.js';
import { CLASS_CAPS } from '../../../../src/instruments/lib/sizeclass.js';
import { WELLHEADS, wellheads, wellheadState, plugIn, unplug, setQuenched, resetWellheads } from '../../../../src/world/sites/kilnyards-layout.js';

const DT = 1 / 60;
const r3 = (v) => +v.toFixed(3);

/** Brea on the line-up: her body 1.72 m (src/hero/rows.js; the GLB's r5Hero.bodyHeight). */
export const BREA_BODY_M = 1.72;

/** Triangles of a form as the line-up page and the grey recipe build it: a box 12; a cylinder or strut of N sides 4N. */
export const SIDES = Object.freeze({ cyl: 16, strut: 10 });
export function trianglesOf(parts) {
  let n = 0;
  for (const p of expandParts(parts)) n += p.type === 'box' ? 12 : p.type === 'cyl' ? 4 * SIDES.cyl : 4 * SIDES.strut;
  return n;
}

/* ------------------------------------------------------------------------------------------------ IK1 + the never list */
export function ik1() {
  const rows = {};
  let ok = true;
  for (const k of M3_KINDS) {
    const F = M3_FORMS[k], b = boundsOf(F.parts), R = F.roster;
    const H = b.max[1], W = b.size[0], L = b.size[2];
    const tris = trianglesOf(F.parts), cap = CLASS_CAPS[R.cls].triangles;
    const row = { cls: R.cls, H: r3(H), W: r3(W), L: r3(L), roster: { H: R.H, W: R.W, L: R.L }, dH: r3(H - R.H), dW: r3(W - R.W), dL: r3(L - R.L),
      xBrea: r3(H / BREA_BODY_M), tris, triCap: cap, groundMin: r3(b.min[1]) };
    row.ok = Math.abs(row.dH) <= 0.1 && Math.abs(row.dW) <= 0.1 && Math.abs(row.dL) <= 0.1 && tris <= cap && R.cls === ({ kiln: 'large', spindle: 'medium', davit: 'medium', sonde: 'small' })[k] && b.min[1] >= -1e-6;
    ok = ok && row.ok;
    rows[k] = row;
  }
  return { ok, rows, note: 'H, W, L in metres from the parts (body frame); xBrea = H over her 1.72 m body. The 1024 sets are the art wave\'s (no texture at blockout).' };
}

const NEVER = /(^|[^a-z])(head|neck|eye|face|tail|jaw|mouth|torso|arm(?!s?\b)|core)([^a-z]|$)/i;
export function neverList() {
  const rows = {};
  let ok = true;
  for (const k of M3_KINDS) {
    const F = M3_FORMS[k];
    const lamps = lampsOf(F.parts);
    const badNames = F.parts.filter((p) => NEVER.test(p.name.replace(/([a-z])([A-Z])/g, '$1 $2'))).map((p) => p.name);
    const emissive = F.parts.filter((p) => p.emissive || p.glow).map((p) => p.name);
    // knees in the sagittal plane: each thigh and shin of a leg keeps one x (within 2 cm)
    const knees = F.parts.filter((p) => p.type === 'strut' && /^(thigh|shin)/.test(p.name)).map((p) => ({ name: p.name, dx: r3(Math.abs(p.a[0] - p.b[0])) }));
    const offPlane = knees.filter((q) => q.dx > 0.02);
    const small = Object.entries(F.hit).filter(([, h]) => h.across < 0.25).map(([n, h]) => `${n} ${h.across}`);
    const row = { lamps: lamps.length, badNames, emissive, legs: knees.length / 2, kneesOffSagittal: offPlane, weakUnder25cm: small };
    row.ok = lamps.length === 1 && !badNames.length && !emissive.length && !offPlane.length && !small.length;
    ok = ok && row.ok;
    rows[k] = row;
  }
  // the Davit's rack: three plates, countable (each 0.25 m or more from the next)
  const plates = M3_FORMS.davit.parts.filter((p) => /^plate\d$/.test(p.name)).map((p) => p.c[2]).sort((a, b) => a - b);
  const gaps = plates.slice(1).map((z, i) => r3(z - plates[i]));
  const rack = { plates: plates.length, gaps, ok: plates.length === 3 && gaps.every((g) => g >= 0.25) };
  return { ok: ok && rack.ok, rows, rack };
}

/* ------------------------------------------------------------------------------------------------ IK2: the firebox door */
function hotKiln(seed) {
  const R = rng(seed);
  const k = new KilnBrain({ x: (R() - 0.5) * 20, z: (R() - 0.5) * 20, heading: R() * Math.PI * 2 });
  k.state = 'plugged';
  return { k, R };
}
/** Step the stagger out at 60 Hz: its length and the multiplier read on every step of it. */
function staggerOut(k) {
  let t = 0, kMin = Infinity, kMax = -Infinity;
  while (k.staggered && t < 10) { kMin = Math.min(kMin, k.damageK()); kMax = Math.max(kMax, k.damageK()); k.step(DT, { wellheads: [] }); t += DT; }
  return { t, kMin, kMax };
}
/** A Brine field centred at a body-frame point of the Kiln. */
function mistAt(k, bx, bz) { const w = bodyToWorld(k.x, k.y, k.z, k.heading, [bx, 0, bz]); return new PotField('brine', { x: w.x, y: k.y, z: w.z }); }

export function ik2() {
  const hotPot = [], hotArrow = [], cold = [], elsewhere = [], durations = [], ks = [];
  for (let i = 0; i < 10; i++) {
    // a pot whose mist stands on the door's side: 0.3-2.4 m out in front of the door, up to 0.8 m to a side
    { const { k, R } = hotKiln(100 + i); const r = k.brine({ kind: 'pot', field: mistAt(k, (R() - 0.5) * 1.6, KILN_DOOR.c[2] + 0.3 + R() * 2.1) }); hotPot.push(r.stagger);
      if (r.stagger) { const s = staggerOut(k); durations.push(r3(s.t)); ks.push(s.kMin, s.kMax); } }
    // a Brine-Gourd arrow from 12-20 m in front, aimed within 0.3 m of the door's centre
    { const { k, R } = hotKiln(200 + i); const d = bodyToWorld(k.x, k.y, k.z, k.heading, [(R() - 0.5) * 0.6, KILN_DOOR.c[1] + (R() - 0.5) * 0.6, KILN_DOOR.c[2]]);
      const a = bodyToWorld(k.x, k.y, k.z, k.heading, [(R() - 0.5) * 4, 1.4, 12 + R() * 8]);
      const b = { x: d.x + (d.x - a.x) * 0.05, y: d.y + (d.y - a.y) * 0.05, z: d.z + (d.z - a.z) * 0.05 };
      const r = k.brine({ kind: 'arrow', a, b }); hotArrow.push(r.stagger);
      if (r.stagger) { const s = staggerOut(k); durations.push(r3(s.t)); ks.push(s.kMin, s.kMax); } }
    // the same pot on a cold door (a Kiln that has never plugged in)
    { const R = rng(300 + i); const k = new KilnBrain({ heading: R() * 6.28 }); cold.push(k.brine({ kind: 'pot', field: mistAt(k, (R() - 0.5) * 1.6, KILN_DOOR.c[2] + 0.3 + R() * 2.1) }).stagger); }
    // Brine anywhere else on a hot Kiln: behind it, at a flank's canisters, an arrow into the dome or a canister
    { const { k, R } = hotKiln(400 + i);
      const spots = [[(R() - 0.5) * 2, -2.6 - R() * 1.5], [2.0 + R() * 0.4, 0.4 - R() * 0.8], [-2.0 - R() * 0.4, 0.4 - R() * 0.8]];
      const [bx, bz] = spots[i % 3];
      let r = k.brine({ kind: 'pot', field: mistAt(k, bx, bz) });
      if (i % 2) {
        const a = bodyToWorld(k.x, k.y, k.z, k.heading, [0, 3.0, 15]), b = bodyToWorld(k.x, k.y, k.z, k.heading, [0, 2.9, 0.9]);
        r = r.stagger ? r : k.brine({ kind: 'arrow', a, b });
      }
      elsewhere.push(r.stagger); }
  }
  const n = (a) => a.filter(Boolean).length;
  const dMin = Math.min(...durations), dMax = Math.max(...durations), kMin = Math.min(...ks), kMax = Math.max(...ks);
  const ok = n(hotPot) === 10 && n(hotArrow) === 10 && n(cold) === 0 && n(elsewhere) === 0 && dMin >= 1.8 && dMax <= 2.2 && kMin === 1 && kMax === 1;
  return { ok, hotPot: `${n(hotPot)}/10`, hotArrow: `${n(hotArrow)}/10`, coldDoor: `${n(cold)}/10`, elsewhere: `${n(elsewhere)}/10`, staggerS: [r3(dMin), r3(dMax)], damageK: [kMin, kMax], brineRadius: POTS.brine.radius };
}

/* ------------------------------------------------------------------------------------------------ IK3: plugged in */
/** The four wellheads of area A's seam (src/world/sites/kilnyards-layout.js), positions only (engine m). */
export const WELLS = WELLHEADS;
/** The seam itself as the Kiln's world: its live records and its plug calls (rule 21: the game's module, not a copy). */
const seamWorld = { get wellheads() { return wellheads(); }, plugIn, unplug };

export function ik3() {
  // the choice: 500 random hot/quenched mixes from random starts on the Yards' walk box: a quenched one never chosen
  const R = rng(7);
  let quenchedChosen = 0, choices = 0;
  const cx = WELLS.reduce((a, w) => a + w.x, 0) / WELLS.length, cz = WELLS.reduce((a, w) => a + w.z, 0) / WELLS.length;
  for (let i = 0; i < 500; i++) {
    const W = WELLS.map((w) => ({ ...w, state: R() < 0.5 ? 'hot' : 'quenched', plugged: null }));
    const w = chooseWellhead(W, cx + (R() - 0.5) * 120, cz + (R() - 0.5) * 120);
    if (w) { choices++; if (w.state !== 'hot') quenchedChosen++; }
  }
  // the walk and the stand on the seam: the nearest wellhead quenched first; 600 s undisturbed
  resetWellheads();
  const near = WELLS.reduce((a, w) => (Math.hypot(w.x - (cx + 30), w.z - (cz + 30)) < Math.hypot(a.x - (cx + 30), a.z - (cz + 30)) ? w : a));
  setQuenched(near.id);
  const k = new KilnBrain({ x: cx + 30, z: cz + 30, heading: Math.PI });
  let pluggedAt = null, headAt = null, maxTurn = 0;
  for (let t = 0; t < 600; t += DT) {
    k.step(DT, seamWorld);
    if (k.plugged) { if (pluggedAt === null) { pluggedAt = t; headAt = k.heading; } maxTurn = Math.max(maxTurn, Math.abs(k.heading - headAt)); }
  }
  const standS = pluggedAt === null ? 0 : 600 - pluggedAt;
  const before = k.well?.id ?? null, seamSays = before ? wellheadState(before).plugged : null;
  const standErr = before ? Math.hypot(k.x - WELLS.find((w) => w.id === before).kilnStand.x, k.z - WELLS.find((w) => w.id === before).kilnStand.z) : null;
  // its wellhead quenched under it (the seam unplugs it): it leaves and takes another hot one
  if (before) setQuenched(before);
  for (let i = 0; i < 60 * 120; i++) k.step(DT, seamWorld);
  const after = k.plugged ? k.well?.id : null;
  // four quenched: 0 Kilns spawn over 24 site-clock hours; one hot: some
  const S0 = new KilnSpawner(), S1 = new KilnSpawner();
  let spawned0 = 0, spawned1 = 0, live1 = 0;
  const allQ = WELLS.map((w) => ({ ...w, state: 'quenched' })), oneHot = WELLS.map((w, i) => ({ ...w, state: i === 1 ? 'hot' : 'quenched' }));
  for (let h = 0; h < 24; h += 0.25) {
    spawned0 += S0.step(0.25, allQ, 0);
    const n = S1.step(0.25, oneHot, live1); spawned1 += n; live1 += n;
  }
  resetWellheads();
  const ok = quenchedChosen === 0 && standS >= KILN_RULES.plugMinS && maxTurn === 0 && seamSays === 'kiln' && standErr !== null && standErr <= 0.1
    && !!after && after !== before && spawned0 === 0 && spawned1 > 0;
  return { ok, quenchedChosen: `${quenchedChosen}/${choices}`, nearestQuenched: near.id, firstWell: before, seamPlugged: seamSays, standErrM: standErr === null ? null : r3(standErr),
    pluggedAtS: r3(pluggedAt ?? -1), standS: r3(standS), maxTurnWhilePlugged: maxTurn, afterQuench: after, spawns24hAllQuenched: spawned0, spawns24hOneHot: spawned1 };
}

/* ------------------------------------------------------------------------------------------------ IK4: the mortar */
export function ik4() {
  const R = rng(11);
  let volleys = 0, outOfBandFired = 0, shells = 0, inRing = 0, onPerson = 0, minLead = Infinity, inRingTargetFired = 0, full = 0;
  for (let i = 0; i < 400; i++) {
    const from = { x: 0, z: 0 }, a = R() * Math.PI * 2, d = 10 + R() * 65;
    const target = { x: Math.cos(a) * d, z: Math.sin(a) * d };
    const ringAt = R() < 0.5 ? { x: target.x + (R() - 0.5) * 16, z: target.z + (R() - 0.5) * 16, r: 4 + R() * 6 } : null;
    const people = [{ x: target.x + (R() - 0.5) * 6, z: target.z + (R() - 0.5) * 6 }];
    const places = { dwellings: ringAt ? [ringAt] : [], people };
    const v = planVolley(from, target, places, R);
    const herIn = ringAt && Math.hypot(target.x - ringAt.x, target.z - ringAt.z) < ringAt.r;
    if (!v.ok) continue;
    volleys++;
    if (d < 25 || d > 60) outOfBandFired++;
    if (herIn) inRingTargetFired++;
    if (v.shells.length === 3) full++;
    for (const s of v.shells) {
      shells++;
      if (ringAt && Math.hypot(s.x - ringAt.x, s.z - ringAt.z) < ringAt.r) inRing++;
      if (people.some((p) => Math.hypot(s.x - p.x, s.z - p.z) < KILN_RULES.mortar.personR)) onPerson++;
      minLead = Math.min(minLead, s.impactT - s.warnT);
    }
  }
  const plugged = planVolley({ x: 0, z: 0 }, { x: 40, z: 0 }, {}, R, { plugged: true }).ok;
  const clear = planVolley({ x: 0, z: 0 }, { x: 40, z: 0 }, {}, rng(3));
  const ok = outOfBandFired === 0 && inRing === 0 && onPerson === 0 && minLead >= KILN_RULES.mortar.warnS && inRingTargetFired === 0 && !plugged && clear.shells.length === 3;
  return { ok, volleys, shells, threeShellVolleys: full, outOfBandFired, inDwellingRing: inRing, onPerson, minWarnLeadS: r3(minLead), firedAtHerInRing: inRingTargetFired, pluggedFires: plugged, clearVolley: clear.shells.length };
}

/* ------------------------------------------------------------------------------------------------ IK5: the Spindle */
/** A machine carrying the ring through the status seam (src/combat/status.js StatusAware). */
function spindleMachine() {
  const ring = new SpindleRing();
  return { ring, m: { alive: true, parts: [], lampDarkT: 0, suspicion: 1, _unseenT: 0, onStatus: (id, s) => ring.onStatus(id, s) } };
}
export function ik5() {
  const R = rng(5);
  const { ring } = spindleMachine();
  let front = 0, back = 0;
  for (let i = 0; i < 10; i++) {
    const h = R() * Math.PI * 2;
    const fa = h + (R() - 0.5) * (100 * Math.PI / 180), ba = h + Math.PI + (R() - 0.5) * (100 * Math.PI / 180), d = 8 + R() * 20;
    if (ring.deflects(h, Math.sin(fa) * d, Math.cos(fa) * d)) front++;
    if (ring.deflects(h, Math.sin(ba) * d, Math.cos(ba) * d)) back++;
  }
  // Brine through the book: half speed while Seized (8 s), full after
  const book = new StatusBook();
  const B = spindleMachine();
  book.apply(B.m, ST.lock);
  let tb = 0, slowK = [];
  for (; tb < 10; tb += DT) { book.step(DT); B.ring.step(DT); if (tb < STATUS[ST.lock].seconds - 0.05) slowK.push(B.ring.speedK); }
  const slowOk = slowK.every((k) => k === SPINDLE_RULES.brineK) && B.ring.speedK === 1;
  const deflectSlowed = (() => { const S = spindleMachine(); book.apply(S.m, ST.lock); S.ring.step(DT); return S.ring.deflects(0, 0, 10); })();
  // Dust through the book: the ring stops and the bearing is exposed 2.0 s; the lamp dark 6 s; the alert reset
  const D = spindleMachine();
  book.apply(D.m, ST.blind);
  let exposed = 0, deflectWhileStopped = 0, steps = 0;
  for (let t = 0; t < 8; t += DT) {
    if (D.ring.bearingExposed()) { exposed += DT; steps++; if (D.ring.deflects(0, 0, 10)) deflectWhileStopped++; }
    D.ring.step(DT); book.step(DT);
  }
  const lampDark = STATUS[ST.blind].seconds;
  // the thrust: the tip's reach and a hit at 9 m
  const reachOf = () => { const T = new SpindleThrust(); T.start(0, 0, 0); let reach = 0; while (T.busy) { T.step(DT); reach = Math.max(reach, T.tip().reach); } return reach; };
  const hitAt = (dist) => { const T = new SpindleThrust(); T.start(0, 0, 0); let hit = false; while (T.busy) { T.step(DT); if (T.struck(0, dist, 0.3)) hit = true; } return hit; };
  const reach = reachOf();
  // the escort: a ward walking (1.1 m/s, a Kiln's walk) with a slow turn; a threat circling 20 m off at 3 m/s
  const ward = { x: 0, z: 0, heading: 0 }, E = new SpindleEscort({ x: 7, z: -3 });
  let minD = Infinity, maxD = 0;
  for (let t = 0; t < 120; t += DT) {
    ward.heading += 0.03 * DT; ward.x += Math.sin(ward.heading) * 1.1 * DT; ward.z += Math.cos(ward.heading) * 1.1 * DT;
    const a = t * (3 / 20), threat = { x: ward.x + Math.sin(a) * 20, z: ward.z + Math.cos(a) * 20 };
    const d = E.step(DT, ward, threat);
    if (t >= 5) { minD = Math.min(minD, d); maxD = Math.max(maxD, d); }
  }
  const ok = front === 10 && back === 0 && slowOk && deflectSlowed && Math.abs(exposed - 2.0) <= 0.2 && deflectWhileStopped === 0
    && Math.abs(reach - 9) <= 0.05 && hitAt(9.25) && !hitAt(9.45) && minD >= 6 && maxD <= 9 && D.m.lampDarkT === lampDark && D.m.suspicion === 0;
  return { ok, frontalDeflected: `${front}/10`, behindDeflected: `${back}/10`, brineHalfSpeed: slowOk, deflectsWhileSlowed: deflectSlowed,
    dustBearingExposedS: r3(exposed), deflectsWhileStopped: deflectWhileStopped, lampDarkS: D.m.lampDarkT, suspicionAfterDust: D.m.suspicion,
    thrustReachM: r3(reach), hitAt9_25: hitAt(9.25), hitAt9_45: hitAt(9.45), escortM: [r3(minD), r3(maxD)] };
}

/* ------------------------------------------------------------------------------------------------ IK6: the Davit */
const inst = (id, x, z, parts, extra = {}) => ({ id, x, z, heading: 0, alive: true, parts, ...extra });
export function ik6() {
  // one repair from 12 m: the time from reaching it to the part sealed
  const dav = new DavitBrain({ x: 0, z: -12 });
  const kiln = inst('kiln-a', 0, 0, { canister1: { state: 'off', hits: 2 }, chimney: { state: 'sealed', hits: 0 } }, { large: true });
  let inReachAt = null, sealedAt = null, t = 0;
  for (; t < 30 && sealedAt === null; t += DT) {
    dav.step(DT, { instruments: [kiln] });
    if (inReachAt === null && Math.hypot(dav.x - kiln.x, dav.z - kiln.z) <= DAVIT_RULES.reachM + 1e-6) inReachAt = t;
    if (kiln.parts.canister1.state === 'sealed') sealedAt = t;
  }
  const reseatS = sealedAt !== null && inReachAt !== null ? sealedAt - inReachAt : Infinity;
  // the rack: five parts off on two kinds: three repairs, then none
  const D2 = new DavitBrain({ x: 0, z: -5 });
  const A = inst('a', 0, 0, { p1: { state: 'off' }, p2: { state: 'off' }, p3: { state: 'off' } }, { large: true });
  const B = inst('b', 6, 0, { p1: { state: 'off' }, p2: { state: 'off' } });
  for (let i = 0; i < 60 * 90; i++) D2.step(DT, { instruments: [A, B] });
  // a plate shot off first: two repairs
  const D3 = new DavitBrain({ x: 0, z: -5 }); D3.shootPlate();
  const A3 = inst('a', 0, 0, { p1: { state: 'off' }, p2: { state: 'off' }, p3: { state: 'off' } });
  for (let i = 0; i < 60 * 90; i++) D3.step(DT, { instruments: [A3] });
  // a Pried winch drum: none
  const D4 = new DavitBrain({ x: 0, z: -5 }); D4.pryWinch();
  const A4 = inst('a', 0, 0, { p1: { state: 'off' } });
  for (let i = 0; i < 60 * 30; i++) D4.step(DT, { instruments: [A4] });
  // the follow: about 20 m behind a large kind walking at 1.1 m/s on a slow turn
  const D5 = new DavitBrain({ x: 0, z: -20 });
  const big = inst('screed', 0, 0, {}, { large: true });
  let minF = Infinity, maxF = 0;
  for (let t2 = 0; t2 < 120; t2 += DT) {
    big.heading += 0.02 * DT; big.x += Math.sin(big.heading) * 1.1 * DT; big.z += Math.cos(big.heading) * 1.1 * DT;
    D5.step(DT, { instruments: [big] });
    if (t2 > 5) { const d = Math.hypot(D5.x - big.x, D5.z - big.z); minF = Math.min(minF, d); maxF = Math.max(maxF, d); }
  }
  // the seam itself
  const p = { state: 'off', hits: 2 }, s = { state: 'sealed' }, z = { state: 'seized', seizedT: 3 };
  const seam = reseat(p) === true && p.state === 'sealed' && p.hits === 0 && reseat(s) === false && reseat(z) === false && z.state === 'seized' && reseat(null) === false;
  const ok = Math.abs(reseatS - 4.0) <= 0.3 && D2.repairs === 3 && D2.plates === 0 && D3.repairs === 2 && D4.repairs === 0 && A4.parts.p1.state === 'off'
    && minF >= DAVIT_RULES.followM - DAVIT_RULES.followTolM && maxF <= DAVIT_RULES.followM + DAVIT_RULES.followTolM && seam;
  return { ok, reseatS: r3(reseatS), repairsFromFullRack: D2.repairs, platesLeft: D2.plates, repairsAfterOnePlateShot: D3.repairs, repairsAfterWinchPried: D4.repairs,
    followM: [r3(minF), r3(maxF)], reseatSeam: seam };
}

/* ------------------------------------------------------------------------------------------------ IK7: the Sonde */
const flat = () => 0;
export function ik7() {
  const R = rng(17);
  // moored 600 s in a wind that rises, falls and swings 30 deg either side of 045
  const S = new SondeBrain({ post: { x: 0, y: 0, z: 0 } });
  let maxTether = 0;
  for (let t = 0; t < 600; t += DT) {
    const wind = { speed: 7 + 7 * Math.sin(t * 0.05) * Math.sin(t * 0.013), fromDeg: 45 + 30 * Math.sin(t * 0.021) };
    S.step(DT, { wind, groundY: flat });
    maxTether = Math.max(maxTether, S.tetherDist());
  }
  // three punctures; Cinder
  const P = new SondeBrain(); P.puncture(); P.puncture(); const twoUp = P.flying && P.state === 'moored'; P.puncture();
  for (let t = 0; t < 20 && P.flying; t += DT) P.step(DT, { wind: { speed: 5, fromDeg: 45 }, groundY: flat });
  const C = new SondeBrain(); C.cinder();
  for (let t = 0; t < 20 && C.flying; t += DT) C.step(DT, { wind: { speed: 5, fromDeg: 45 }, groundY: flat });
  // fouled fans: the time to the ground
  const F = new SondeBrain();
  for (let t = 0; t < 30; t += DT) F.step(DT, { wind: { speed: 5, fromDeg: 45 }, groundY: flat });
  F.foulFans(0); const f0 = F.t;
  while (F.flying && F.t - f0 < 30) F.step(DT, { wind: { speed: 5, fromDeg: 45 }, groundY: flat });
  const sinkS = F.downAt - f0;
  // a cut tether: 10 winds (any bearing, 3-10 m/s, gusting 12 deg either side): drift bearing against the mean wind's
  let maxErr = 0, maxCrash = 0;
  for (let i = 0; i < 10; i++) {
    const from = R() * 360, speed = 3 + R() * 7, ph = R() * 6;
    const T = new SondeBrain({ post: { x: 0, y: 0, z: 0 } });
    for (let t = 0; t < 40; t += DT) T.step(DT, { wind: { speed, fromDeg: from }, groundY: flat });
    const cx = T.x, cz = T.z; T.cutTether(); const c0 = T.t;
    while (T.flying && T.t - c0 < 200) T.step(DT, { wind: { speed: speed * (1 + 0.2 * Math.sin(T.t * 0.7 + ph)), fromDeg: from + 12 * Math.sin(T.t * 0.4 + ph) }, groundY: flat });
    const brg = bearingOf(T.x - cx, T.z - cz), want = (from + 180) % 360;
    maxErr = Math.max(maxErr, Math.abs(((brg - want + 540) % 360) - 180));
    maxCrash = Math.max(maxCrash, T.downAt - c0);
  }
  // F61's staging: the trade (from 045, 5 m/s), 4 s after the cut: how far SW of the post
  const F61 = new SondeBrain();
  for (let t = 0; t < 40; t += DT) F61.step(DT, { wind: { speed: 5, fromDeg: 45 }, groundY: flat });
  F61.cutTether();
  for (let t = 0; t < 4; t += DT) F61.step(DT, { wind: { speed: 5, fromDeg: 45 }, groundY: flat });
  const f61 = { distM: r3(Math.hypot(F61.x, F61.z)), bearing: r3(bearingOf(F61.x, F61.z)), altM: r3(F61.keelY() - F61.shackle().y), sinking: F61.keelY() - F61.shackle().y < SONDE_RULES.hoverAltM };
  // calima: it drops to 6 m
  const K = new SondeBrain();
  for (let t = 0; t < 30; t += DT) K.step(DT, { wind: { speed: 3, fromDeg: 45 }, calima: true, groundY: flat });
  // the flare and the kite
  const night = new SondeBrain().flare({ night: true }), day = new SondeBrain().flare({ night: false });
  const sight = { none: sondeSightM('none'), opening: sondeSightM('opening'), gliding: sondeSightM('gliding'), folding: sondeSightM('folding'), landing: sondeSightM('landing') };
  const ok = maxTether <= SONDE_RULES.tetherM + 1e-6 && twoUp && P.state === 'down' && C.state === 'down' && Math.abs(sinkS - SONDE_RULES.fanSinkS) <= 0.3
    && maxErr <= 10 && maxCrash <= SONDE_RULES.crashMaxS && Math.abs(K.keelY() - K.shackle().y - SONDE_RULES.calimaAltM) <= 0.1 && night?.flagS === 8 && day === null
    && sight.gliding === 2 * sight.none && sight.opening === sight.none && sight.folding === sight.none && sight.landing === sight.none && f61.distM >= 10 && Math.abs(f61.bearing - 225) <= 10;
  return { ok, maxTetherM: r3(maxTether), aloftAfterTwoPunctures: twoUp, threePuncturesDown: P.state === 'down', cinderDown: C.state === 'down', fanSinkS: r3(sinkS),
    cutDriftErrDeg: r3(maxErr), cutCrashMaxS: r3(maxCrash), f61, calimaAltM: r3(K.keelY() - K.shackle().y), nightFlareFlagS: night?.flagS ?? null, dayFlare: day, sightM: sight, downwindOf045: downwind({ fromDeg: 45 }) };
}

/** Clouded, the typed seam (src/combat/status.js): the generic half and a kind's own answer. */
export function clouded() {
  const book = new StatusBook();
  const calls = [];
  const m = { alive: true, parts: [], lampDarkT: 0, suspicion: 0.9, _unseenT: 0, onStatus: (id, s) => calls.push([id, s]) };
  book.apply(m, ST.blind);
  const S = STATUS[ST.blind];
  const plain = { alive: true, lampDarkT: 0 };   // a machine with no seam fields: nothing thrown, the lamp dark
  const took = book.apply(plain, ST.blind);
  const ok = m.lampDarkT === 6 && m.suspicion === 0 && m._unseenT >= 1000 && calls.length === 1 && calls[0][0] === ST.blind && calls[0][1] === 6
    && S.word === 'CLOUDED' && S.breaksLock === true && S.resetsAlert === true && S.damageK === 1 && took && plain.lampDarkT === 6;
  return { ok, lampDarkT: m.lampDarkT, suspicion: m.suspicion, unseenT: m._unseenT, onStatusCalls: calls, word: S.word, breaksLock: S.breaksLock, resetsAlert: S.resetsAlert };
}

export const ROWS = Object.freeze({ IK1: ik1, 'IK1-never': neverList, IK2: ik2, IK3: ik3, IK4: ik4, IK5: ik5, IK6: ik6, IK7: ik7, CLOUDED: clouded });
