/**
 * M3 wave 1, area C: the measurements behind rows IK1-IK7 of the M3 brief, in Node on the game's own modules (rule 21:
 * a twin imports the game's module, never a copy of its law). The rows (./rows.test.mjs) grade these; ./report.mjs
 * prints them. Sim time at 60 Hz unless a row says otherwise. Every function returns { ok, ...numbers, why }.
 */
import { M3_FORMS, M3_KINDS, boundsOf, lampsOf } from './forms.mjs';
import { KilnBrain, KilnSpawner, KILN_RULES, chooseWellhead, planVolley, rng, bodyToWorld, kilnDamage, shellWarning, kilnAwake } from '../../../../src/instruments/kinds/kiln/rules.js';
import { KILN_DOOR } from '../../../../src/instruments/kinds/kiln/form.js';
import * as THREE from 'three';
import { Machine } from '../../../../src/entities/machines/machine.js';
import { SpindleRing, SpindleThrust, SpindleEscort, SPINDLE_RULES } from '../../../../src/instruments/kinds/spindle/rules.js';
import { DavitBrain, DAVIT_RULES } from '../../../../src/instruments/kinds/davit/rules.js';
import { SondeBrain, SONDE_RULES, downwind, bearingOf, sondeSightM } from '../../../../src/instruments/kinds/sonde/rules.js';
import { reseat } from '../../../../src/instruments/lib/kindkit.js';
import { ST, STATUS, StatusBook } from '../../../../src/combat/status.js';
import { PotField, POTS } from '../../../../src/combat/pots.js';
import { CLASS_CAPS, encounterVerdict } from '../../../../src/instruments/lib/sizeclass.js';
import { WELLHEADS, wellheads, wellheadState, plugIn, unplug, setQuenched, resetWellheads } from '../../../../src/world/sites/kilnyards-layout.js';

import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST } from '../../../../src/audio/manifest.js';
import { KILN_CUES } from '../../../../src/instruments/kinds/kiln/cues.js';
import { SPINDLE_CUES } from '../../../../src/instruments/kinds/spindle/cues.js';
import { DAVIT_CUES } from '../../../../src/instruments/kinds/davit/cues.js';
import { SONDE_CUES } from '../../../../src/instruments/kinds/sonde/cues.js';

const DT = 1 / 60;
const r3 = (v) => +v.toFixed(3);

/** Brea on the line-up: her body 1.72 m (src/hero/rows.js; the GLB's r5Hero.bodyHeight). */
export const BREA_BODY_M = 1.72;

/**
 * The triangles of each grey hull AS THE RECIPE WRITES IT (tools/build/instruments/gen-m3-blockout.mjs, run into a
 * scratch directory outside the repo): read back from each GLB file's own index accessors (judge, d695cc9: the row
 * counted its own simplified shapes, 1860 / 1900 / 2000 / 1060, against the recipe's 2916 / 2380 / 3536 / 1156).
 */
export async function recipeTriangles() {
  const { build } = await import('../../../build/instruments/gen-m3-blockout.mjs');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'm3c-grey-'));
  try {
    const rows = await build({ out: dir });
    const out = {};
    for (const r of rows) {
      const buf = readFileSync(r.file), jsonLen = buf.readUInt32LE(12), J = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
      let tris = 0;
      for (const m of J.meshes || []) for (const pr of m.primitives) tris += (pr.indices != null ? J.accessors[pr.indices].count : J.accessors[pr.attributes.POSITION].count) / 3;
      out[r.kind] = { tris, recipeSays: r.tris, bytes: r.bytes };
    }
    return out;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/* ------------------------------------------------------------------------------------------------ IK1 + the never list */
export async function ik1() {
  const rows = {};
  let ok = true;
  const glb = await recipeTriangles();
  for (const k of M3_KINDS) {
    const F = M3_FORMS[k], b = boundsOf(F.parts), R = F.roster;
    const H = b.max[1], W = b.size[0], L = b.size[2];
    const tris = glb[k].tris, cap = CLASS_CAPS[R.cls].triangles;
    const row = { cls: R.cls, H: r3(H), W: r3(W), L: r3(L), roster: { H: R.H, W: R.W, L: R.L }, dH: r3(H - R.H), dW: r3(W - R.W), dL: r3(L - R.L),
      xBrea: r3(H / BREA_BODY_M), tris, trisFrom: 'the recipe GLB', glbBytes: glb[k].bytes, triCap: cap, groundMin: r3(b.min[1]) };
    row.ok = Math.abs(row.dH) <= 0.1 && Math.abs(row.dW) <= 0.1 && Math.abs(row.dL) <= 0.1 && tris <= cap && tris === glb[k].recipeSays && R.cls === ({ kiln: 'large', spindle: 'medium', davit: 'medium', sonde: 'small' })[k] && b.min[1] >= -1e-6;
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

/**
 * A Kiln as the game's damage path sees it: Machine#takeDamage on a record with the hull's armour, its hit parts (the
 * door a part, never weak: bible §8.3) and the brain beside it. The door's part answers hits within its half sizes.
 */
function damageKiln(brain) {
  const door = { name: 'fireboxDoor', attached: true, weak: false, weakMult: 1, tearable: false };
  const m = {
    alive: true, armor: 0.15, weakPoints: [], parts: [door], brittleT: 0, health: 1e6, elemental: {}, elemThreshold: 100,
    _visible: true, state: 'alert', ctx: { player: null }, lastKnown: new THREE.Vector3(), suspicion: 1, _unseenT: 0,
    manager: {}, ai: { perception: { unseenHit() {} }, reactions: { onDamage() {} } }, emit() {}, setState() {}, _die() {},
    resolveHitVolume(p) { const d = brain.doorWorld(); return Math.hypot(p.x - d.x, p.y - d.y, p.z - d.z) <= 0.45 ? { name: 'fireboxDoor', part: 'fireboxDoor' } : null; },
    takeDamage: Machine.prototype.takeDamage,
  };
  return m;
}
/** The same 10 hits (door and dome, 20-40 impact) on a hot Kiln out of the window and in it, through the game's path. */
function damageInWindow(seed) {
  const { k, R } = hotKiln(seed);
  const m = damageKiln(k);
  const hits = [];
  for (let i = 0; i < 10; i++) {
    const onDoor = i % 2 === 0, bp = onDoor ? [(R() - 0.5) * 0.6, KILN_DOOR.c[1] + (R() - 0.5) * 0.6, KILN_DOOR.c[2]] : [(R() - 0.5) * 1.2, 3.0 + R() * 0.4, 0.4];
    const w = bodyToWorld(k.x, k.y, k.z, k.heading, bp);
    hits.push({ impact: 20 + R() * 20, tear: 0, element: 'none', point: new THREE.Vector3(w.x, w.y, w.z), seen: true, onDoor });
  }
  const out = hits.map((h) => kilnDamage(m, k, h).damage);
  const r = k.brine({ kind: 'pot', field: mistAt(k, 0, KILN_DOOR.c[2] + 1.0) });
  const inWin = [];
  for (const h of hits) { if (!k.staggered) break; inWin.push(kilnDamage(m, k, h).damage); k.step(0.15, { wellheads: [] }); }
  const ratios = inWin.map((d, i) => d / out[i]);
  const doorVsBody = out.filter((_, i) => hits[i].onDoor).map((d, j) => d / hits[2 * j].impact).concat(out.filter((_, i) => !hits[i].onDoor).map((d, j) => d / hits[2 * j + 1].impact));
  return { sprung: r.stagger, hitsInWindow: inWin.length, ratios, perImpact: doorVsBody };
}

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
  // the damage path: the same hits in the window and out of it, through Machine#takeDamage (judge, d695cc9: the row read
  // the constant): the ratio in the window, and the door's damage per impact against the dome's (no door multiplier)
  const dp = [damageInWindow(500), damageInWindow(501)];
  const ratios = dp.flatMap((d) => d.ratios), per = dp.flatMap((d) => d.perImpact);
  const pathK = { hitsInWindow: dp.reduce((a, d) => a + d.hitsInWindow, 0), min: Math.min(...ratios), max: Math.max(...ratios), perImpact: [r3(Math.min(...per)), r3(Math.max(...per))] };
  const ok = n(hotPot) === 10 && n(hotArrow) === 10 && n(cold) === 0 && n(elsewhere) === 0 && dMin >= 1.8 && dMax <= 2.2 && kMin === 1 && kMax === 1
    && dp.every((d) => d.sprung) && pathK.hitsInWindow >= 20 && pathK.min === 1 && pathK.max === 1 && Math.min(...per) === Math.max(...per);
  return { ok, hotPot: `${n(hotPot)}/10`, hotArrow: `${n(hotArrow)}/10`, coldDoor: `${n(cold)}/10`, elsewhere: `${n(elsewhere)}/10`, staggerS: [r3(dMin), r3(dMax)], damageK: [kMin, kMax],
    damagePath: { via: 'Machine#takeDamage (src/entities/machines/machine.js)', hitsInWindow: pathK.hitsInWindow, inWindowOverOut: [pathK.min, pathK.max], damagePerImpactDoorAndDome: pathK.perImpact }, brineRadius: POTS.brine.radius };
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
  // the hose on the well (F59): the coupling's face to the wellhead's centre, level (the seam's run is 3.2 m)
  const hoseTo = (id) => { const w = WELLS.find((q) => q.id === id), c = k.couplingWorld(); return Math.hypot(c.x - w.x, c.z - w.z); };
  const hose1 = before ? hoseTo(before) : Infinity;
  // its wellhead quenched under it (the seam unplugs it): it leaves and takes another hot one
  if (before) setQuenched(before);
  for (let i = 0; i < 60 * 120; i++) k.step(DT, seamWorld);
  const after = k.plugged ? k.well?.id : null;
  const hose2 = after ? hoseTo(after) : Infinity;
  // without a seam stand (a wellhead elsewhere): it stands standM off the head with its coupling's flank to it
  const lone = { id: 'lone', x: 40, z: -12, state: 'hot', plugged: null };
  const K2 = new KilnBrain({ x: 10, z: 20, heading: 2.0 });
  for (let t = 0; t < 120 && !K2.plugged; t += DT) K2.step(DT, { wellheads: [lone] });
  const cl = K2.couplingWorld(), hose3 = K2.plugged ? Math.hypot(cl.x - lone.x, cl.z - lone.z) : Infinity;
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
    && !!after && after !== before && spawned0 === 0 && spawned1 > 0 && Math.max(hose1, hose2, hose3) <= KILN_RULES.hoseM;
  return { ok, quenchedChosen: `${quenchedChosen}/${choices}`, nearestQuenched: near.id, firstWell: before, seamPlugged: seamSays, standErrM: standErr === null ? null : r3(standErr),
    couplingToWellheadM: { first: r3(hose1), afterQuench: r3(hose2), noSeamStand: r3(hose3), bar: KILN_RULES.hoseM },
    pluggedAtS: r3(pluggedAt ?? -1), standS: r3(standS), maxTurnWhilePlugged: maxTurn, afterQuench: after, spawns24hAllQuenched: spawned0, spawns24hOneHot: spawned1 };
}

/* ------------------------------------------------------------------------------------------------ IK4: the mortar */
export function ik4() {
  const R = rng(11);
  let volleys = 0, outOfBandFired = 0, shells = 0, inRing = 0, onPerson = 0, minLead = Infinity, inRingTargetFired = 0, full = 0, held = 0, reaimed = 0;
  let minShadowLead = Infinity, minWhistleLead = Infinity, warnGaps = 0;
  for (let i = 0; i < 400; i++) {
    const from = { x: 0, z: 0 }, a = R() * Math.PI * 2, d = 10 + R() * 65;
    const target = { x: Math.cos(a) * d, z: Math.sin(a) * d };
    const ringAt = R() < 0.5 ? { x: target.x + (R() - 0.5) * 16, z: target.z + (R() - 0.5) * 16, r: 4 + R() * 6 } : null;
    const people = [{ x: target.x + (R() - 0.5) * 6, z: target.z + (R() - 0.5) * 6 }];
    const places = { dwellings: ringAt ? [ringAt] : [], people };
    const v = planVolley(from, target, places, R);
    const herIn = ringAt && Math.hypot(target.x - ringAt.x, target.z - ringAt.z) < ringAt.r;
    if (v.held) held++;
    if (!v.ok) continue;
    reaimed += v.reaimed || 0;
    volleys++;
    if (d < 25 || d > 60) outOfBandFired++;
    if (herIn) inRingTargetFired++;
    if (v.shells.length === 3) full++;
    for (const s of v.shells) {
      shells++;
      if (ringAt && Math.hypot(s.x - ringAt.x, s.z - ringAt.z) < ringAt.r) inRing++;
      if (people.some((p) => Math.hypot(s.x - p.x, s.z - p.z) < KILN_RULES.mortar.personR)) onPerson++;
      minLead = Math.min(minLead, s.impactT - s.warnT);
      // the shadow and the whistle as the game will read them (shellWarning), sampled at 60 Hz on the volley's clock
      let sh = null, wh = null, gap = false, seen = false;
      for (let t = 0; t <= s.impactT + DT; t += DT) {
        const w = shellWarning(s, t);
        if (w.shadow && sh === null) sh = t;
        if (w.whistle && wh === null) wh = t;
        if (t >= s.impactT - 1e-9) continue;
        if (seen && !w.shadow) gap = true;
        if (w.shadow) seen = true;
      }
      minShadowLead = Math.min(minShadowLead, sh === null ? -1 : s.impactT - sh);
      minWhistleLead = Math.min(minWhistleLead, wh === null ? -1 : s.impactT - wh);
      if (gap) warnGaps++;
    }
  }
  const plugged = planVolley({ x: 0, z: 0 }, { x: 40, z: 0 }, {}, R, { plugged: true }).ok;
  const clear = planVolley({ x: 0, z: 0 }, { x: 40, z: 0 }, {}, rng(3));
  const W = KILN_RULES.mortar.warnS;
  const ok = outOfBandFired === 0 && inRing === 0 && onPerson === 0 && minLead >= W && inRingTargetFired === 0 && !plugged && clear.shells.length === 3
    && full === volleys && minShadowLead >= W - DT && minWhistleLead >= W - DT && warnGaps === 0;
  return { ok, volleys, shells, threeShellVolleys: full, heldFire: held, reaimedShells: reaimed, outOfBandFired, inDwellingRing: inRing, onPerson,
    minWarnLeadS: r3(minLead), minShadowLeadS: r3(minShadowLead), minWhistleLeadS: r3(minWhistleLead), warnGaps, firedAtHerInRing: inRingTargetFired, pluggedFires: plugged, clearVolley: clear.shells.length,
    note: 'shadow and whistle measured in Node (shellWarning, 60 Hz); drawn and heard on the page: UNMEASURED (behaviour wave)' };
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
  const tradeRun = F61.tetherDist(), tradeAlt = F61.keelY() - F61.shackle().y;
  F61.cutTether();
  for (let t = 0; t < 4; t += DT) F61.step(DT, { wind: { speed: 5, fromDeg: 45 }, groundY: flat });
  const f61 = { distM: r3(Math.hypot(F61.x, F61.z)), bearing: r3(bearingOf(F61.x, F61.z)), altM: r3(F61.keelY() - F61.shackle().y), sinking: F61.keelY() - F61.shackle().y < tradeAlt - 0.5 };
  const taut = { tradeRunM: r3(tradeRun), tradeKeelOverShackleM: r3(tradeAlt), slackM: r3(SONDE_RULES.tetherM - tradeRun) };
  // calima: it drops to 6 m
  const K = new SondeBrain();
  for (let t = 0; t < 30; t += DT) K.step(DT, { wind: { speed: 3, fromDeg: 45 }, calima: true, groundY: flat });
  // the flare and the kite
  const night = new SondeBrain().flare({ night: true }), day = new SondeBrain().flare({ night: false });
  const sight = { none: sondeSightM('none'), opening: sondeSightM('opening'), gliding: sondeSightM('gliding'), folding: sondeSightM('folding'), landing: sondeSightM('landing') };
  const ok = maxTether <= SONDE_RULES.tetherM + 1e-6 && twoUp && P.state === 'down' && C.state === 'down' && Math.abs(sinkS - SONDE_RULES.fanSinkS) <= 0.3
    && maxErr <= 10 && maxCrash <= SONDE_RULES.crashMaxS && Math.abs(K.keelY() - K.shackle().y - SONDE_RULES.calimaAltM) <= 0.1 && night?.flagS === 8 && day === null
    && sight.gliding === 2 * sight.none && sight.opening === sight.none && sight.folding === sight.none && sight.landing === sight.none && f61.distM >= 10 && Math.abs(f61.bearing - 225) <= 10 && f61.sinking && taut.slackM <= 0.1;
  return { ok, maxTetherM: r3(maxTether), aloftAfterTwoPunctures: twoUp, threePuncturesDown: P.state === 'down', cinderDown: C.state === 'down', fanSinkS: r3(sinkS),
    cutDriftErrDeg: r3(maxErr), cutCrashMaxS: r3(maxCrash), f61, taut, calimaAltM: r3(K.keelY() - K.shackle().y), nightFlareFlagS: night?.flagS ?? null, dayFlare: day, sightM: sight, downwindOf045: downwind({ fromDeg: 45 }) };
}

/* ------------------------------------------------------------------------------------------------ IK8: the cue ids */
const CUE_ID = /^[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*$/;
/** A direct file play in a kind's own source: a sound file named, or a player built (the director plays cue ids). */
const DIRECT_PLAY = /\.(ogg|mp3|wav|m4a|flac|opus)\b|new\s+Audio\s*\(|decodeAudioData|createBufferSource|AudioBufferSourceNode|['"`]\/audio\//;
const KIND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../src/instruments/kinds');

/** Drive each kind's rules through every state it has, and collect what they emit. */
function cueScenarios() {
  const out = {};
  { // the Kiln: walk, couple, plug, the door sprung and shut, quenched under it, the next well, woken
    const W = [{ id: 'a', x: 30, z: 0, state: 'hot', plugged: null }, { id: 'b', x: -30, z: 0, state: 'hot', plugged: null }];
    const k = new KilnBrain({ x: 20, z: 12 });
    const run = (s) => { for (let t = 0; t < s; t += DT) k.step(DT, { wellheads: W }); };
    run(60);
    k.brine({ kind: 'pot', field: mistAt(k, 0, KILN_DOOR.c[2] + 1.0) }); run(3);
    W.find((w) => w.id === k.well?.id).state = 'quenched'; run(150);
    k.wake(); run(3);
    const v = planVolley({ x: 0, z: 0 }, { x: 40, z: 0 }, {}, rng(2)), hold = planVolley({ x: 0, z: 0 }, { x: 40, z: 0 }, {}, rng(2), { plugged: true });
    const whistle = shellWarning(v.shells[0], v.shells[0].warnT + 0.01);
    out.kiln = { events: [...k.events, { type: 'volley', cue: v.cue }, { type: 'held-fire', cue: hold.cue }, { type: 'whistle', cue: whistle.cue }], states: Object.keys(KILN_CUES.state), cues: KILN_CUES };
  }
  { // the Spindle: Brine, Dust, a thrust that strikes
    const ring = new SpindleRing(), T = new SpindleThrust();
    ring.onStatus(ST.lock, 2); for (let t = 0; t < 3; t += DT) ring.step(DT);
    ring.onStatus(ST.blind, 6); for (let t = 0; t < 3; t += DT) ring.step(DT);
    T.start(0, 0, 0); while (T.busy) { T.step(DT); T.struck(0, 8, 0.3); }
    out.spindle = { events: [...ring.events, ...T.events], states: Object.keys(SPINDLE_CUES.state), cues: SPINDLE_CUES, initial: ['spinning', 'rest'] };
  }
  { // the Davit: idle, following a large kind, three repairs, spent; a plate shot, the winch Pried
    const d = new DavitBrain({ x: 0, z: -30 });
    d.step(DT, { instruments: [] });
    const big = inst('big', 0, 0, {}, { large: true });
    for (let t = 0; t < 20; t += DT) d.step(DT, { instruments: [big] });
    big.parts = { p1: { state: 'off' }, p2: { state: 'off' } };
    for (let t = 0; t < 60; t += DT) d.step(DT, { instruments: [big] });
    d.shootPlate(); for (let t = 0; t < 2; t += DT) d.step(DT, { instruments: [big] });
    const d2 = new DavitBrain(); d2.pryWinch(); d2.step(DT, { instruments: [big] });
    out.davit = { events: [...d.events, ...d2.events], states: Object.keys(DAVIT_CUES.state), cues: DAVIT_CUES, initial: ['idle'] };
  }
  { // the Sonde: moored, a night flare, cut and adrift to the ground; three punctures; fouled fans
    const env = { wind: { speed: 5, fromDeg: 45 }, groundY: flat };
    const a = new SondeBrain(); for (let t = 0; t < 10; t += DT) a.step(DT, env); a.flare({ night: true }); a.cutTether(); for (let t = 0; t < 70 && a.flying; t += DT) a.step(DT, env);
    const b = new SondeBrain(); b.puncture(); b.puncture(); b.puncture(); for (let t = 0; t < 20 && b.flying; t += DT) b.step(DT, env);
    const c = new SondeBrain(); for (let t = 0; t < 5; t += DT) c.step(DT, env); c.foulFans(0); for (let t = 0; t < 10 && c.flying; t += DT) c.step(DT, env);
    out.sonde = { events: [...a.events, ...b.events, ...c.events], states: Object.keys(SONDE_CUES.state), cues: SONDE_CUES, initial: ['moored'] };
  }
  return out;
}

export function ik8Cues() {
  const known = new Set(MANIFEST.map((m) => m.set));
  const rows = {};
  let ok = true;
  for (const [kind, S] of Object.entries(cueScenarios())) {
    const changes = S.events.filter((e) => e.type === 'state');
    const reached = new Set([...(S.initial || []), ...changes.map((e) => e.to)]);
    const uncued = S.events.filter((e) => typeof e.cue !== 'string' || !CUE_ID.test(e.cue)).map((e) => e.type);
    const declared = [...Object.values(S.cues.state), ...Object.values(S.cues.event), ...Object.values(S.cues.lamp)];
    const badIds = declared.filter((id) => typeof id !== 'string' || !CUE_ID.test(id));
    const ids = [...new Set(declared)];
    // 0 direct file plays in the kind's own files (form, rules, cues)
    const files = readdirSync(path.join(KIND_DIR, kind)).filter((f) => f.endsWith('.js'));
    const plays = files.flatMap((f) => readFileSync(path.join(KIND_DIR, kind, f), 'utf8').split('\n').map((l, i) => (DIRECT_PLAY.test(l) ? `${f}:${i + 1}` : null)).filter(Boolean));
    const row = {
      stateChanges: changes.length, firedWithCue: `${changes.filter((e) => CUE_ID.test(e.cue || '')).length}/${changes.length}`,
      statesReached: `${S.states.filter((s) => reached.has(s)).length}/${S.states.length}`, notReached: S.states.filter((s) => !reached.has(s)),
      events: S.events.length, eventsWithoutCue: uncued, badIds, directFilePlays: plays.length, playsAt: plays, files,
      inManifest: ids.filter((id) => known.has(id)), pendingAreaH: ids.filter((id) => !known.has(id)),
    };
    row.ok = changes.length > 0 && !uncued.length && !badIds.length && !row.notReached.length && plays.length === 0;
    ok = ok && row.ok;
    rows[kind] = row;
  }
  return { ok, rows, note: 'ids only (the Cues seam): every state change and event carries its id; the pending ids are new and wait for area H (src/audio/manifest.js); 0 direct file plays in kinds/<kind>/*.js' };
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


/* ------------------------------------------------------------------------------------------------ IK1-read (wave 2) */
/**
 * The originality read of the grey forms, as geometry (wave 2; the wave-1 review's four risks). PROXIES, not a judge:
 * the films and the owner's page are the read. Per kind:
 *   frontDiscs  round flat faces that face the front or the back lens (the exposed end of a z-axis cylinder, or a ring
 *               standing in the frontal plane), 0.25 m or more in radius: a disc to the lens is what read as a face or an
 *               eye (the Spindle's upright ring and hub, the Sonde's nose cap and fan ducts). Bar 0.
 *   lampX       the lamp's distance off the centre line (m): one centred pupil is what the lens rule forbids. Bar >= 0.1.
 *   lampShare   the lamp's height over the hull's height: wave 1's Kiln lamp sat high beside the stack (0.70). Bar <= 0.6.
 * `forms` defaults to the tree's (M3_FORMS); pass another table to read older forms the same way.
 */
export function readProxies(forms = M3_FORMS) {
  const rows = {};
  let ok = true;
  for (const k of M3_KINDS) {
    const F = forms[k], H = boundsOf(F.parts).max[1];
    const zc = F.parts.filter((p) => p.type === 'cyl' && p.axis === 'z');
    const ends = [];
    for (const p of zc) {
      for (const [sgn, r] of [[-1, p.r], [1, p.r2 ?? p.r]]) {
        if (r < 0.25) continue;
        const z = p.c[2] + sgn * p.h / 2;
        // capped: another z-axis cylinder on the same axis meets this end with a radius at least as large
        const capped = zc.some((q) => q !== p && Math.abs(q.c[0] - p.c[0]) < 0.01 && Math.abs(q.c[1] - p.c[1]) < 0.01
          && [[-1, q.r], [1, q.r2 ?? q.r]].some(([s2, r2]) => Math.abs(q.c[2] + s2 * q.h / 2 - z) < 0.01 && r2 >= r - 0.01));
        if (!capped) ends.push(`${p.name} ${sgn < 0 ? 'back' : 'front'} r ${r}`);
      }
    }
    const rings = F.parts.filter((p) => p.type === 'torus' && p.axis === 'z' && p.R + p.tube >= 0.25).map((p) => `${p.name} R ${p.R}`);
    const lamp = lampsOf(F.parts)[0];
    const row = { frontDiscs: ends.length + rings.length, discs: [...ends, ...rings], lampX: r3(Math.abs(lamp.c[0])), lampY: lamp.c[1], lampShare: r3(lamp.c[1] / H) };
    row.ok = row.frontDiscs === 0 && row.lampX >= 0.1 && row.lampShare <= 0.6;
    ok = ok && row.ok;
    rows[k] = row;
  }
  return { ok, rows, note: 'geometric proxies for the wave-1 review\'s four risks; the line-up film is the read' };
}

/* ------------------------------------------------------------------------------------------------ Q4 under R7 (wave 2) */
/**
 * The encounter at the Yards under the orchestrator's provisional ruling R7. The brief's Q4 default (kept): "Two Kilns
 * at the Yards, one awake at a time (the other plugged in and still, which is the stealth window the bible wants), one
 * Spindle escort, and a Davit from the third wellhead. Never two awake." R7: "a plugged, still Kiln does not count as
 * an awake large kind for the encounter rule (it is the stealth window); never two awake."
 *
 * Two Kilns walk to area A's wellheads by their own rules and plug in; a Spindle holds 7.5 m off the first and a Davit
 * 20 m behind it. Then 40 seeded fights of 600 s each: at random moments she strikes or is seen by either Kiln
 * (`wake(site)`), throws Brine on either hot door (`brine`), and kills the awake one; a Kiln that is killed is gone.
 * Every step: how many are awake (`kilnAwake`; bar: never more than 1), and the encounter rule
 * (src/instruments/lib/sizeclass.js `encounterVerdict`) over the hulls it counts: the awake Kilns, the Spindle, the
 * Davit (bar: ok on every step). For the record, the same steps with every live Kiln counted (the rule before R7).
 * Then the spawner: a Kiln spawns while none is awake, and none while one is.
 */
export function q4r7() {
  const cls = { kiln: 'large', spindle: 'medium', davit: 'medium' };
  const classOf = (k) => cls[k];
  let steps = 0, maxAwake = 0, failR7 = 0, failOld = 0, held = 0, woke = 0, sprung = 0, kills = 0, bothPlugged = 0;
  const firstFail = [];
  for (let seed = 1; seed <= 40; seed++) {
    const R = rng(1000 + seed);
    resetWellheads();
    const world = { get wellheads() { return wellheads(); }, plugIn, unplug };
    const W = WELLHEADS;
    const A = new KilnBrain({ id: 'kiln-a', x: W[0].x + 14, z: W[0].z + 10, heading: 0 });
    const B = new KilnBrain({ id: 'kiln-b', x: W[3].x + 14, z: W[3].z + 10, heading: 0 });
    const site = [A, B];
    for (let t = 0; t < 240 && !(A.plugged && B.plugged); t += DT) { A.step(DT, world); B.step(DT, world); }
    if (A.plugged && B.plugged) bothPlugged++;
    const spindle = { kind: 'spindle', x: A.x + 7.5, z: A.z }, davit = { kind: 'davit', x: A.x - 20, z: A.z };
    const acts = [];
    for (let t = 5; t < 600; t += 4 + R() * 26) acts.push({ t, what: R() < 0.55 ? 'wake' : R() < 0.75 ? 'brine' : 'kill', who: R() < 0.5 ? A : B });
    let ai = 0;
    for (let i = 0, t = 0; t < 600; i++, t = i * DT) {
      while (ai < acts.length && acts[ai].t <= t) {
        const { what, who } = acts[ai++];
        if (who.alive === false) continue;
        if (what === 'wake') { if (who.wake(site)) woke++; else if (who.events.at(-1)?.type === 'wake-held') held++; }
        else if (what === 'brine') { const d = who.doorWorld(); const r = who.brine?.({ kind: 'pot', field: { x: d.x + 0.3 * Math.sin(who.heading), y: d.y, z: d.z + 0.3 * Math.cos(who.heading), contains: () => true } }); if (r?.stagger) sprung++; }
        else if (what === 'kill' && kilnAwake(who)) { who.alive = false; kills++; }
      }
      for (const k of site) if (k.alive !== false) k.step(DT, world);
      const live = site.filter((k) => k.alive !== false);
      const awake = live.filter(kilnAwake);
      maxAwake = Math.max(maxAwake, awake.length);
      const others = [spindle, davit];
      const vR7 = encounterVerdict([...awake.map((k) => ({ kind: 'kiln', x: k.x, z: k.z })), ...others], classOf);
      const vOld = encounterVerdict([...live.map((k) => ({ kind: 'kiln', x: k.x, z: k.z })), ...others], classOf);
      steps++;
      if (!vR7.ok) { failR7++; if (firstFail.length < 3) firstFail.push({ seed, t: r3(t), why: vR7.anchors.flatMap((a) => a.why) }); }
      if (!vOld.ok) failOld++;
    }
  }
  // the spawner (R7): with one Kiln plugged and none awake a second spawns; with one awake none does
  const S1 = new KilnSpawner(), S2 = new KilnSpawner();
  resetWellheads();
  const spawnedNoneAwake = S1.step(KILN_RULES.respawnH, wellheads(), 1, 0), spawnedOneAwake = S2.step(KILN_RULES.respawnH, wellheads(), 1, 1);
  // the brain's own API: does kilnAwake count a plugged, staggered Kiln? (it should not: it stands still at its well)
  resetWellheads();
  const P = new KilnBrain({ x: WELLHEADS[1].kilnStand.x + 6, z: WELLHEADS[1].kilnStand.z + 6 });
  const pw = { get wellheads() { return wellheads(); }, plugIn, unplug };
  for (let t = 0; t < 240 && !P.plugged; t += DT) P.step(DT, pw);
  const pluggedCounts = kilnAwake(P);
  const ok = bothPlugged === 40 && maxAwake <= 1 && failR7 === 0 && held > 0 && woke > 0 && spawnedNoneAwake === 1 && spawnedOneAwake === 0 && pluggedCounts === false;
  return { ok, ruling: 'R7 (provisional)', fights: 40, steps, bothPluggedBeforeTheFight: `${bothPlugged}/40`, maxAwakeAtOnce: maxAwake, encounterFailingStepsR7: failR7,
    encounterFailingStepsBeforeR7: failOld, wakesTaken: woke, wakesHeld: held, doorsSprung: sprung, kills, firstFail,
    spawner: { noneAwake: spawnedNoneAwake, oneAwake: spawnedOneAwake }, pluggedKilnCounted: pluggedCounts };
}

export const ROWS = Object.freeze({ IK1: ik1, 'IK1-never': neverList, 'IK1-read': readProxies, 'Q4-R7': q4r7, IK2: ik2, IK3: ik3, IK4: ik4, IK5: ik5, IK6: ik6, IK7: ik7, 'IK8-cues': ik8Cues, CLOUDED: clouded });
