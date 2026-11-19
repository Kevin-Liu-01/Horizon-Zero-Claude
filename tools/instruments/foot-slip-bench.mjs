/**
 * A45c's Node twin (M2 wave 3, area C; rule 4 of the M2 briefs): a planted Instrument foot does not move.
 *   node tools/instruments/foot-slip-bench.mjs [--kind tiller] [--speeds 1.5,4.87,6,9] [--glb <file>] [--json]
 *
 * The game's own GaitController (src/entities/machines/gait.js) and autorig (`buildRig`) on the kind's rig as its
 * GLB declares it (`asset.extras.r5Rig`), with the kind's gait options (read from the kind module's source so the
 * bench cannot drift from it), on flat ground, simulation time (1/60 s steps, one step per drawn frame). The root walks
 * straight at each speed in the states the page row sees (patrol, attack). Every step reads `debugFeet()` as A45c does
 * and grades the same two bars: a planted pair moves <= 0.12 m between two reads and <= 0.05 m per simulation step.
 *
 * It also prints each leg's reach band against what the stance asks of it (the hip-to-plant distance), because a leg
 * whose stance distance falls under the solver's fold limit (`_solveLeg` dMin) cannot put its foot on the plant: the
 * solve pushes the ankle out along the hip line and the "planted" foot rides up and down by the shortfall.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
import * as THREE from 'three';

register(new URL('../gates/hero-sweep/vite-stub.mjs', import.meta.url));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { GaitController } = await import(path.join(ROOT, 'src/entities/machines/gait.js'));
const { buildRig } = await import(path.join(ROOT, 'src/entities/machines/autorig.js'));

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const KIND = arg('--kind', 'tiller');
const SPEEDS = arg('--speeds', '1.5,4.87,6,9').split(',').map(Number);
const JSON_OUT = argv.includes('--json');
const DT = 1 / 60, SECS = 6;

function glbExtras(file) {
  const b = fs.readFileSync(file);
  const jl = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + jl).toString('utf8')).asset.extras;
}

/** The kind's gait options as its module writes them (`HEX_WALK`, `HEX_RUN` and the GaitController literal). */
async function kindGait(kind) {
  const src = fs.readFileSync(path.join(ROOT, `src/instruments/kinds/${kind}.js`), 'utf8');
  const grab = (name) => {
    const m = src.match(new RegExp(`const ${name} = (\\{[\\s\\S]*?\\});`));
    return m ? Function(`return (${m[1]})`)() : null;
  };
  const walk = grab('HEX_WALK'), run = grab('HEX_RUN');
  const g = src.match(/new GaitController\(this, this\.rig, (\{[\s\S]*?\n {4}\})\);/);
  const LOOK_YAW = Number((src.match(/const LOOK_YAW = ([\d.]+)/) || [])[1] ?? 0.85);
  const opts = g ? Function('HEX_WALK', 'HEX_RUN', 'LOOK_YAW', `return (${g[1]})`)(walk, run, LOOK_YAW) : { walk, run };
  const runSpeed = Number((src.match(/runSpeed: ([\d.]+)/) || [])[1] ?? 6);
  const walkSpeed = Number((src.match(/walkSpeed: ([\d.]+)/) || [])[1] ?? 1.5);
  return { opts, runSpeed, walkSpeed };
}

function makeMachine(extras, kg, state) {
  const root = new THREE.Group(); root.name = 'root';
  const body = new THREE.Group(); body.name = 'body'; root.add(body);
  const engine = { frames: 0, steps: 1, simTime: 0 };
  const terrain = { getHeight: () => 0, getNormal: (x, z, out) => out.set(0, 1, 0), surfaceAt: () => null };
  const m = {
    kind: KIND, root, body, position: root.position, heading: 0, _speed: 0, state, alive: true, lowLOD: false,
    _attack: null, _airborne: false, _accelPitch: 0, eyeHeight: 1.7, runSpeed: kg.runSpeed, walkSpeed: kg.walkSpeed,
    lastKnown: new THREE.Vector3(0, 0, 40), meshes: [], model: new THREE.Group(),
    ctx: { terrain, engine, player: { position: new THREE.Vector3(0, 0, 40) }, events: { emit() {}, on() { return () => {}; } } },
    _dustPuff() {},
  };
  const rig = buildRig(m, extras.r5Rig);
  const size = extras.r5Size || [2, 2, 2.5];
  const gait = new GaitController(m, rig, { bodyLength: Math.max(size[0], size[2]), ...kg.opts });
  return { m, rig, gait, engine };
}

function run(extras, kg, speed, state) {
  const { m, gait, engine } = makeMachine(extras, kg, state);
  const prev = new Map();
  let worstStep = 0, worstAt = null, pairs = 0, slips = 0, t = 0;
  const legStats = gait.legs.map(() => ({ dMin: Infinity, dMax: 0 }));
  for (let i = 0; i < SECS / DT; i++) {
    // ramp to speed over 0.5 s, as a charge commits
    const v = speed * Math.min(1, t / 0.5);
    m._speed = v;
    m._accelPitch += (v - m._accelPitch) * (1 - Math.exp(-4 * DT));   // machine.js's smoothed speed (the pitch cue)
    m.position.z += v * DT;
    m.root.rotation.y = m.heading;
    m.root.updateMatrixWorld(true);
    engine.frames++; engine.simTime += DT; t += DT;
    gait.update(DT, t);
    m.root.updateMatrixWorld(true);
    const feet = gait.debugFeet();
    for (let fi = 0; fi < feet.length; fi++) {
      const f = feet[fi], leg = gait.legs[fi];
      if (leg.planted) {
        const hip = new THREE.Vector3().setFromMatrixPosition(leg.L.thigh.matrixWorld);
        const d = hip.distanceTo(leg.plant);
        const s = legStats[fi]; if (d < s.dMin) s.dMin = d; if (d > s.dMax) s.dMax = d;
      }
      const on = f.planted && Math.abs(f.world.y) <= 0.25;
      const q = prev.get(f.name);
      if (on && q && t > 1) {
        const step = Math.hypot(f.world.x - q.x, f.world.y - q.y, f.world.z - q.z);
        pairs++; if (step > 0.02) slips++;
        if (step > worstStep) { worstStep = step; worstAt = { foot: f.name, t: +t.toFixed(3), dy: +(f.world.y - q.y).toFixed(4) }; }
      }
      prev.set(f.name, on ? { x: f.world.x, y: f.world.y, z: f.world.z } : null);
    }
  }
  const L = gait.legs.map((leg, i) => {
    const l1 = leg.L.l1, l2 = leg.L.l2;
    return { id: leg.L.id, l1: +l1.toFixed(3), l2: +l2.toFixed(3), solveDMin: +(Math.abs(l1 - l2) + Math.max(l1, l2) * 0.12).toFixed(3),
      stanceD: [+legStats[i].dMin.toFixed(3), +legStats[i].dMax.toFixed(3)] };
  });
  return { speed, state, worstStepM: +worstStep.toFixed(4), worstAt, plantedPairs: pairs, slipsOver2cm: slips, legs: L };
}

const extras = glbExtras(arg('--glb', path.join(ROOT, `public/models/instruments/${KIND}.glb`)));
const kg = await kindGait(KIND);
const rows = [];
for (const s of SPEEDS) for (const st of ['patrol', 'attack']) rows.push(run(extras, kg, s, st));
const worst = Math.max(...rows.map((r) => r.worstStepM));
const pass = worst <= 0.05;
if (JSON_OUT) console.log(JSON.stringify({ kind: KIND, pass, barStepM: 0.05, worstStepM: worst, rows }, null, 1));
else {
  for (const r of rows) console.log(`${KIND} ${r.state.padEnd(6)} ${String(r.speed).padStart(5)} m/s  worst planted step ${r.worstStepM.toFixed(4)} m  slips>2cm ${r.slipsOver2cm}/${r.plantedPairs}  ${r.worstAt ? JSON.stringify(r.worstAt) : ''}`);
  console.log('legs (l1, l2, the solver fold limit, the hip-to-plant distance over every stance):');
  for (const l of rows[rows.length - 1].legs) console.log(`  ${l.id} l1 ${l.l1} l2 ${l.l2} dMin ${l.solveDMin} stance d ${l.stanceD[0]}-${l.stanceD[1]}`);
  console.log(`${pass ? 'PASS' : 'FAIL'} worst ${worst.toFixed(4)} m per simulation step (bar 0.05)`);
}
process.exitCode = pass ? 0 : 1;
