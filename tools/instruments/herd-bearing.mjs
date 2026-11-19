/**
 * IN2, THE HERD HOLDS ITS BEARING (M2 wave 4, area C; M2 briefs §6): the Node twin, on simulation time.
 *   node tools/instruments/herd-bearing.mjs [--json]
 *
 * The herd's own code (tiller-herd.js HerdFile, fileStep, the gate `herdIgnores`, and machine.js moveTowardS) walks a
 * file of 3-6 kinematic Tillers 120 m along one bearing at the herd's walk (1.5 m/s, 80 s), each with the game's own
 * Perception (src/entities/machines/ai/perception.js: the cone, the fill, hasLOS with the sight occluders) on the
 * Tiller's perception row as kinds/tiller.js registers it (read from the kind's source), its sight range 34 m, its eye
 * 1.7 m, its own built hull published to the sight occluders every step (and skipped by its own perception), as
 * kinds/tiller.js does.
 *
 *   BESIDE (ten walks): she walks with the herd beside one of its hulls, 1.5-2.4 m off that hull's centreline (the
 *     moving-cover lee is 1.3-1.7 m off it), crouched or standing, the whole 80 s; she never stands on the line.
 *   ON IT (ten stands): she stands still on the herd's line 8-26 m ahead of the leader, crouched or standing, 12 s.
 *   CONTROL: the ten beside walks with the gate off (the M2 wave 3 game): how often the herd turned on her.
 *
 * A REACTION is any member's suspicion reaching its kind's susEnter (0.5: patrol -> suspicious). Bars (IN2): every
 * member's heading within 2 deg of the bearing for the whole 120 m in every walk; 0 of 10 beside walks react; 10 of 10
 * stands on the bearing react. Reported beside it: when each stand first reacted, and the control's count.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
import * as THREE from 'three';

register(new URL('../gates/hero-sweep/vite-stub.mjs', import.meta.url));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { Perception } = await import(path.join(ROOT, 'src/entities/machines/ai/perception.js'));
const { registerKindTables, perceptionCfg } = await import(path.join(ROOT, 'src/entities/machines/ai/tables.js'));
const { HOT } = await import(path.join(ROOT, 'src/instruments/lib/hot.js'));
const { setOccluder, clearOccluders } = await import(path.join(ROOT, 'src/instruments/lib/sight.js'));
const { hullShapes, hullShapesInto } = await import(path.join(ROOT, 'src/instruments/lib/blockout.js'));
const { FILE, HerdFile, fileStep, herdIgnores, BEARING } = await import(path.join(ROOT, 'src/instruments/kinds/tiller-herd.js'));
const { _st, moveTowardS } = await import(path.join(ROOT, 'src/entities/machines/machine.js'));

const DT = 1 / 60, WALK = 1.5, D2R = Math.PI / 180, CLIMB_M = 120;

/** tiller.js's perception row and sight numbers, read from its source (the bench cannot drift from the kind). */
function tillerRow() {
  const src = fs.readFileSync(path.join(ROOT, 'src/instruments/kinds/tiller.js'), 'utf8');
  const m = src.match(/perception: (\{[^}]*\})/);
  const perception = m ? Function(`return (${m[1]})`)() : {};
  const sightRange = Number((src.match(/sightRange: ([\d.]+)/) || [])[1] ?? 34);
  const eyeHeight = Number((src.match(/eyeHeight: ([\d.]+)/) || [])[1] ?? 1.7);
  return { perception, sightRange, sightHalf: 50 * D2R, eyeHeight };
}
const ROW = tillerRow();
registerKindTables('tiller', { perception: ROW.perception }, { replace: true });
const flat = { getHeight: () => 0, heightFast: () => 0 };

function makeHerd(n, bearing) {
  const engine = { simTime: 0 };
  const ctx = { engine, terrain: flat, events: { on: () => () => {}, emit: () => {} } };
  const herd = { members: [], alarmed: false, vector: { x: Math.sin(bearing), z: Math.cos(bearing) } };
  const manager = { ctx, squads: { herds: [herd] }, lamps: { telegraph: () => {} }, perception: null };
  const sx = Math.sin(bearing), sz = Math.cos(bearing);
  for (let i = 0; i < n; i++) {
    const m = {
      i, kind: 'tiller', alive: true, _disposed: false, ctx, manager, herd, state: 'patrol', lowLOD: false, parts: [],
      turnRate: 1.5, bodyRadius: 1.15, walkSpeed: WALK, eyeHeight: ROW.eyeHeight, sightRange: ROW.sightRange, sightHalf: ROW.sightHalf,
      position: new THREE.Vector3(-sx * FILE.gap * i, 0, -sz * FILE.gap * i), lastKnown: new THREE.Vector3(), _ignoreHer: 0,
      sc: { heading: bearing, _speed: WALK, lampDarkT: 0, playerDist: 0, suspicion: 0, _unseenT: 0, _stateT: 0, scanOffset: 0, detectFill: 0 },
      _occSlot: `tiller:${i + 1}:`, shapes: null,
    };
    m.per = new Perception(m);
    herd.members.push(m);
  }
  herd.file = new HerdFile(herd);
  const f = herd.file; f.refresh();
  const lead = herd.members[0];
  for (let d = FILE.gap * n + 4; d >= 0; d -= FILE.crumbM / 2) f.record(lead.position.x - sx * d, lead.position.z - sz * d);
  return { engine, herd, f, bearing, members: herd.members };
}

const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };

/**
 * One run: `herdN` members on `bearing`; `brea(t, H, out)` writes her position each step; `secs` of sim time; the herd
 * walks (`walk`) or stands; `gate` false turns IN2's gate off (the control). Returns the reaction and the bearing hold.
 */
function run({ herdN, bearing, brea, secs, crouch, walk = true, gate = true }) {
  clearOccluders();
  const H = makeHerd(herdN, bearing), cfg = perceptionCfg('tiller');
  const P = new THREE.Vector3();
  HOT.terrain = flat; HOT.collision = null; HOT.pOk = 1; HOT.pHealth = 100; HOT.pCrouch = crouch ? 1 : 0; HOT.pReedHide = 0;
  HOT.ppos = P; HOT.simTime = 0; HOT.engine = H.engine;
  let reactedS = null, maxSusp = 0, maxTurnDeg = 0, ignoredSteps = 0, steps = 0, x0 = H.members[0].position.x, z0 = H.members[0].position.z;
  for (let i = 0; i < secs / DT; i++) {
    const t = i * DT;
    HOT.simTime = t; H.engine.simTime = t;
    const prev = P.clone();
    brea(t, H, P);
    HOT.pMoveSpeed = Math.hypot(P.x - prev.x, P.z - prev.z) / DT;
    for (const m of H.members) {
      if (walk) {
        if (H.f.leader === m) {
          H.f.record(m.position.x, m.position.z);
          _st.x = m.position.x + Math.sin(bearing) * 30; _st.z = m.position.z + Math.cos(bearing) * 30; _st.speed = WALK;
          moveTowardS(m, DT);
        } else fileStep(m, H.f, DT, WALK);
      }
      if (!m.shapes) { m.shapes = hullShapes('tiller', m.position.x, m.position.z, m.sc.heading, 'built', 0); m.shapes.forEach((s, k) => setOccluder(m._occSlot + k, s)); }
      else hullShapesInto('tiller', m.position.x, m.position.z, m.sc.heading, 'built', 0, m.shapes);
      maxTurnDeg = Math.max(maxTurnDeg, angDiff(m.sc.heading, bearing) / D2R);
    }
    for (const m of H.members) {
      m._ignoreHer = gate ? herdIgnores(m, true, P.x, P.z, t) : 0;
      steps++; if (m._ignoreHer === 1) ignoredSteps++;
      m.sc._stateT = t;
      m.per.update(DT);
      if (m.sc.suspicion > maxSusp) maxSusp = m.sc.suspicion;
      if (reactedS === null && m.sc.suspicion >= cfg.susEnter) reactedS = +t.toFixed(2);
    }
  }
  const L = H.members[0];
  clearOccluders();
  return { reactedS, maxSuspicion: +maxSusp.toFixed(3), maxTurnDeg: +maxTurnDeg.toFixed(2), walkedM: +Math.hypot(L.position.x - x0, L.position.z - z0).toFixed(1),
    ignoredFrac: +(ignoredSteps / Math.max(1, steps)).toFixed(3) };
}

/** Her place beside member `who` (its centre + `lat` m to its side `side`, `fwd` m along it), walking with it. */
const beside = (who, lat, side, fwd) => (t, H, out) => {
  const m = H.members[Math.min(who, H.members.length - 1)], h = H.bearing;
  const ux = Math.sin(h), uz = Math.cos(h), rx = uz, rz = -ux;
  out.set(m.position.x + rx * side * lat + ux * fwd, 0, m.position.z + rz * side * lat + uz * fwd);
};
/** Her place on the line, `d` m ahead of where the leader stood at t = 0 (she stands still; the file walks at her). */
const ahead = (d, off) => (t, H, out) => {
  if (t === 0) { const h = H.bearing, L = H.members[0]; out.set(L.position.x + Math.sin(h) * d + Math.cos(h) * off, 0, L.position.z + Math.cos(h) * d - Math.sin(h) * off); }
};

export const BESIDE = Array.from({ length: 10 }, (_, k) => ({
  herdN: 3 + (k % 4), bearing: (23 + 31 * k) * D2R, who: k % 3, lat: 1.5 + (0.9 * k) / 9, side: k % 2 ? 1 : -1,
  fwd: [-1.2, 0, 1.2, -0.6, 0.6][k % 5], crouch: k % 2 === 0,
}));
export const ON_IT = Array.from({ length: 10 }, (_, k) => ({
  herdN: 3 + (k % 4), bearing: (41 + 29 * k) * D2R, d: 8 + (18 * k) / 9, off: [0, 0.6, -0.6, 1.0, -1.0][k % 5], crouch: k % 3 === 2,
}));

export function runHerdBearing() {
  const secsClimb = CLIMB_M / WALK;
  const besideRuns = BESIDE.map((w) => ({ ...w, bearing: +(w.bearing / D2R).toFixed(0), ...run({ herdN: w.herdN, bearing: w.bearing, crouch: w.crouch, secs: secsClimb, brea: beside(w.who, w.lat, w.side, w.fwd) }) }));
  // she stands still on the line; the file walks toward her and the first hull would reach her in (d - 4.5) / 1.5 s:
  // 12 s of sim time, the herd walking (a reaction is the herd SEEING her ahead, before it arrives)
  const onRuns = ON_IT.map((w) => ({ ...w, bearing: +(w.bearing / D2R).toFixed(0), ...run({ herdN: w.herdN, bearing: w.bearing, crouch: w.crouch, secs: 12, brea: ahead(w.d, w.off) }) }));
  const control = BESIDE.map((w) => ({ ...w, bearing: +(w.bearing / D2R).toFixed(0), ...run({ herdN: w.herdN, bearing: w.bearing, crouch: w.crouch, secs: secsClimb, brea: beside(w.who, w.lat, w.side, w.fwd), gate: false }) }));
  const besideReacted = besideRuns.filter((r) => r.reactedS !== null).length;
  const onReacted = onRuns.filter((r) => r.reactedS !== null).length;
  const controlReacted = control.filter((r) => r.reactedS !== null).length;
  const maxTurnDeg = Math.max(...besideRuns.map((r) => r.maxTurnDeg));
  const minWalked = Math.min(...besideRuns.map((r) => r.walkedM));
  return {
    pass: besideReacted === 0 && onReacted === 10 && maxTurnDeg <= 2 && minWalked >= CLIMB_M - 0.5,
    besideReacted, onReacted, controlReacted, maxTurnDeg, minWalked, bearingStrip: BEARING,
    tiller: { sightRange: ROW.sightRange, eyeHeight: ROW.eyeHeight, perception: ROW.perception },
    beside: besideRuns, on: onRuns, control,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = runHerdBearing();
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 1));
  else {
    console.log(`IN2 beside the bearing (walking with the herd ${CLIMB_M} m, 1.5-2.4 m off a hull's centreline):`);
    r.beside.forEach((o) => console.log(`  herd ${o.herdN} bearing ${o.bearing} member ${o.who} lat ${o.lat.toFixed(2)} ${o.crouch ? 'crouched' : 'standing'}: reacted ${o.reactedS ?? '-'} s, max suspicion ${o.maxSuspicion}, max turn ${o.maxTurnDeg} deg, walked ${o.walkedM} m`));
    console.log('IN2 on the bearing (standing still on the line ahead of the leader):');
    r.on.forEach((o) => console.log(`  herd ${o.herdN} bearing ${o.bearing} ${o.d.toFixed(1)} m ahead, ${o.off} m off the line, ${o.crouch ? 'crouched' : 'standing'}: reacted ${o.reactedS ?? '-'} s, max suspicion ${o.maxSuspicion}`));
    console.log(`  control (the gate off, the M2 wave 3 game): the beside walks reacted in ${r.controlReacted} of 10`);
    console.log(`${r.pass ? 'PASS' : 'FAIL'} beside reacted ${r.besideReacted} of 10 (bar 0); on the bearing reacted ${r.onReacted} of 10 (bar 10); bearing held within ${r.maxTurnDeg} deg (bar 2) over ${r.minWalked} m (bar ${CLIMB_M})`);
  }
  process.exitCode = r.pass ? 0 : 1;
}
