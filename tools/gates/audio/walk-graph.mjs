/**
 * THE SLICE WALK THROUGH THE GAME'S OWN AUDIO, RENDERED IN THE PAGE (BUILD M1.6k fix round 1, the judge's fixes 1 and 6:
 * "measure loudness and true peak on the real graph ... HRTF panners, the reverb convolver, the real
 * DynamicsCompressor limiter, the old synth fallbacks still on"; "show that the limiter's model matches the real one").
 *
 * Browser module (imported by the row A-audio-walk-graph, tools/gates/audio/live-rows.mjs). It builds a SECOND GameAudio
 * (src/audio/audio.js, the class the game runs) on an OfflineAudioContext, so everything the player would hear is in
 * the render: the bank decoded by SampleBank, the six buses and the master DynamicsCompressor of buses.js, the HRTF
 * chain pool and the valley reverb, the Ducker, the cue director (src/audio/slice/director.js: beds, wind in cane, the
 * lamp chirps from the lamps it polls, Saltrow's work, the bell, the music duck), the MusicDirector's Pans theme, the
 * zone loops (pumps, the sluice, the Brazier), the footstep rule of update(), and every Round-4 synthesized voice that
 * still answers an event while the bank is up (each one counted by name).
 *
 * The walk is the offline walk's script (tools/gates/audio/slice-walk.mjs, 190 s of "Raker's Morning") played as GAME
 * STATE and GAME EVENTS at the real places of the island: a stand-in player moved along Saltrow's street, past a wind
 * pump, to the Gauge at Sluice 3, into a reed bed of the real reed mask (its real gust clock), to the dyke fight with a
 * stand-in Plumb and three Pegs (their states drive the real lamp rule), and back to a real Brazier; the events are the
 * ones the game emits (arrow-fired, arrow-hit, melee-hit, machine-state, machine-attack-phase, machine-footfall,
 * plumb-chime, gauge-sluice, sighting-on, machine-tagged, player-hurt, ammo-crafted, ui-*, save-written ...).
 *
 * The render advances in steps of 1/30 s: the context suspends at each step, the step runs the game's update(dt) and
 * the events due, and it resumes. While a step runs, performance.now() reads the render clock, Math.random() a seeded
 * generator (the walk is the same every run) and setTimeout() is held (GameAudio's one-shot voices disconnect on a
 * wall-clock timer, which an offline render would fire mid-render). The real game in the page is untouched: the second
 * GameAudio has its own event bus and its own stand-in player, camera and Instruments, and reads only the island's
 * terrain, water, reed mask and Braziers.
 *
 *   renderWalkGraph(CTX) -> { loudness, truePeak, limiter, peaks, synth, cues, slice, ... }
 */
import { GameAudio } from '/src/audio/audio.js';
import { DEFAULT_VOLUMES } from '/src/audio/buses.js';
import { LIMITER } from '/src/audio/slice/mix.js';
import { PUMP_AT, SALTROW_MID } from '/src/audio/slice/director.js';
import { STREET } from '/src/world/settlements/saltrow-layout.js';
import { GAUGE, fieldPoint } from '/src/world/sites/layout.js';
import { integratedLufs, truePeakDb, samplePeakDb, shortTermMax, shortTermSeries } from '/tools/gates/audio/lufs.mjs';

const SR = 48000;
const D2R = Math.PI / 180;

function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

class Bus {
  constructor() { this.m = new Map(); }
  on(n, f) { (this.m.get(n) || this.m.set(n, []).get(n)).push(f); }
  off(n, f) { const a = this.m.get(n); if (a) { const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); } }
  emit(n, p) { const a = this.m.get(n); if (a) for (const f of a.slice()) f(p); }
}

/** A dense cell of reed bed `want` (or of any bed), from the real mask: { x, z, bed } or null. */
function reedSpot(mask, want = 0) {
  const N = mask.n, c = mask.cell;
  let best = null;
  const cells = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const o = (j * N + i) * 2;
    if (mask.base[o] < 0.7 * 255) continue;
    const bed = mask.base[o + 1];
    if (want != null && bed !== want) continue;
    cells.push({ x: mask.x0 + (i + 0.5) * c, z: mask.z0 + (j + 0.5) * c, bed });
  }
  if (!cells.length) return want != null ? reedSpot(mask, null) : null;
  // the cell nearest the bed's centroid
  const cx = cells.reduce((a, q) => a + q.x, 0) / cells.length, cz = cells.reduce((a, q) => a + q.z, 0) / cells.length;
  for (const q of cells) { const d = Math.hypot(q.x - cx, q.z - cz); if (!best || d < best.d) best = { ...q, d }; }
  return best;
}

export async function renderWalkGraph(CTX, { sec = 190, step = 1 / 30, seed = 0x51ce } = {}) {
  const t0wall = performance.now();
  const V = CTX.player.position.constructor;
  const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const oc = new OC(2, Math.round(sec * SR), SR);

  /* ---------------------------------------------------------------- the stand-in world */
  const events = new Bus();
  const player = { position: new V(), moveSpeed: 0, crouching: false, inReedCover: false, dodging: false, health: 100, maxHealth: 100, healing: false };
  const camera = new CTX.camera.constructor();
  const machines = [];
  const combat = { drawStrength: 0, nockLanded: false, activeWeapon: { id: 'bow' }, weapon: { id: 'bow' }, steady: null, melee: { stance: 'idle', phase: 'idle', heavy: false } };
  const env = { time: 8.92, wind: { strength: 0.85 }, weather: 'trade', nightFactor: 0, water: CTX.environment?.water ?? CTX.water ?? null };
  const reeds = CTX.reeds ? { mask: CTX.reeds.mask, clocks: CTX.reeds.clocks, t: 0 } : null;
  const brList = CTX.braziers?.list || [];
  const braziers = { list: brList, lit: new Set() };
  const ctx = {
    events, player, camera, combat, environment: env, reeds, braziers, water: env.water,
    machines: { list: machines, roleOf: (k) => CTX.machines?.roleOf?.(k) },
    terrain: CTX.terrain, collision: CTX.collision || null, vegetation: CTX.vegetation, settlements: CTX.settlements,
    params: new URLSearchParams(''), state: 'playing', settings: {}, sighting: { active: false },
  };
  const ground = (x, z) => { try { return CTX.terrain?.getHeight ? CTX.terrain.getHeight(x, z) : 0; } catch { return 0; } };
  const place = (o, x, z, h = 0) => { o.position.set(x, ground(x, z) + h, z); };
  let face = { x: 0, z: -1 };
  const look = () => {
    const p = player.position;
    camera.position.set(p.x, p.y + 1.6, p.z);
    camera.lookAt(p.x + face.x * 10, p.y + 1.6, p.z + face.z * 10);
    camera.updateMatrixWorld(true);
  };
  const mk = (kind, eyeHeight, extra = {}) => { const m = { kind, alive: true, state: 'patrol', eyeHeight, position: new V(), lampDarkT: 0, dazeT: 0, id: `walk-${kind}-${machines.length}`, ...extra }; machines.push(m); return m; };

  // the places (the island's own): Saltrow's street, a pump, Sluice 3, a reed bed, a Brazier
  const fw = { x: Math.sin(STREET.bearing * D2R), z: -Math.cos(STREET.bearing * D2R) };
  const street = (s, r = 0) => ({ x: STREET.x + fw.x * s + Math.cos(STREET.bearing * D2R) * r, z: STREET.z + fw.z * s + Math.sin(STREET.bearing * D2R) * r });
  const pump = PUMP_AT[0];
  const realKeeper = (CTX.machines?.list || []).find((m) => m.kind === 'gauge');
  const sl = realKeeper ? { x: realKeeper.position.x, z: realKeeper.position.z } : fieldPoint(GAUGE.u, GAUGE.v);
  const reed = reeds ? reedSpot(reeds.mask, 0) : null;
  const br = brList.length ? (brList[0].obj?.position || brList[0].def) : null;
  const brazier = br && Number.isFinite(br.x) && Number.isFinite(br.z) ? { x: br.x, z: br.z, id: brList[0].id } : { x: SALTROW_MID.x + 20, z: SALTROW_MID.z, id: null };

  // stand-in Instruments: the Gauge at Sluice 3, a Plumb, three Pegs (their states drive the lamp rule)
  let tide = 0.4;
  const gauge = mk('gauge', 4.8, { reading: () => tide });
  place(gauge, sl.x, sl.z);
  const plumb = mk('plumb', 2.6);
  const pegs = [mk('peg', 0.9), mk('peg', 0.9), mk('peg', 0.9)];
  const park = (m) => place(m, SALTROW_MID.x + 900, SALTROW_MID.z + 900);   // out of earshot until its scene
  park(plumb); for (const p of pegs) park(p);

  /* ---------------------------------------------------------------- the route (segments) and the events */
  // a segment: [t0, t1, from {x,z}, to {x,z}, speed m/s (the stride rule's), { crouch, reed }]
  const segs = [];
  const seg = (a, b, from, to, o = {}) => segs.push({ a, b, from, to, ...o });
  const toward = (p, q, d) => { const L = Math.hypot(q.x - p.x, q.z - p.z) || 1; return { x: p.x + (q.x - p.x) / L * d, z: p.z + (q.z - p.z) / L * d }; };
  seg(0, 30, street(2), street(2 + 1.6 * 30));                                       // down Saltrow's street
  const pa = { x: pump.x - 60, z: pump.z + 25 }, pb = { x: pump.x + 40, z: pump.z + 25 };
  seg(30, 58, pa, pb, { speed: 3.6 });                                               // a jog past a pump at 25 m
  const g0 = toward(sl, { x: sl.x + 40, z: sl.z + 30 }, 46);
  seg(58, 72, g0, toward(sl, g0, 25), { speed: 1.5 });                              // walking up to Sluice 3
  seg(72, 84, toward(sl, g0, 25), toward(sl, g0, 25), { speed: 0 });               // the Alidade on a Plumb
  const rIn = reed ? { x: reed.x, z: reed.z } : { x: sl.x, z: sl.z + 60 };
  const rOut = { x: rIn.x + 9.6, z: rIn.z };
  seg(84, 92, rOut, rIn, { speed: 1.2, crouch: true, reed: true });
  seg(92, 112, rIn, rIn, { speed: 0, crouch: true, reed: true });
  seg(112, 118, rIn, { x: rIn.x - 8.4, z: rIn.z }, { speed: 1.4, crouch: true, reed: true });
  const dk = { x: pump.x + 60, z: pump.z - 60 };                                     // the dyke fight
  seg(118, 150, dk, { x: dk.x + 10, z: dk.z }, { speed: 2.2 });                     // strafing at 2.2 m/s (the stride's speed)
  const back = { x: brazier.x - 120, z: brazier.z };
  seg(150, 168, back, toward(brazier, back, 12), { speed: 6.2 });                    // the sprint back
  seg(168, 176, toward(brazier, back, 12), toward(brazier, back, 2.5), { speed: 1.2 });
  seg(176, 190, toward(brazier, back, 2.5), toward(brazier, back, 2.5), { speed: 0 });

  const E = [];        // [t, fn, label]
  const at = (t, label, fn) => E.push([t, fn, label]);
  const emit = (n, p = {}) => () => events.emit(n, p);
  // the hour turns twice (the bell's three tolls), on the street and on the Pans
  at(3, 'hour 9', () => { env.time = 9.0; });
  at(44, 'hour 10', () => { env.time = 10.0; });
  // Sluice 3 opens, its float ring moves, the stilts step
  at(62, 'gauge-sluice', emit('gauge-sluice', { id: GAUGE.id, sluice: 3, tide: 0.4, open: true, by: 'script' }));
  at(66, 'float', () => { tide = 0.52; });
  for (const t of [69, 70.5]) at(t, 'gauge footfall', () => events.emit('machine-footfall', { machine: gauge, position: gauge.position }));
  // the Alidade on a Plumb 60 m off: raise, a bearing, its chime, its lamp wary then calm
  at(72.5, 'plumb in view', () => { const p = player.position; place(plumb, p.x - 0.4 * 60, p.z - 0.92 * 60); face = { x: -0.4, z: -0.92 }; });
  at(73, 'sighting-on', () => { ctx.sighting.active = true; events.emit('sighting-on'); });
  at(75.5, 'machine-tagged', emit('machine-tagged', { machine: plumb }));
  at(77, 'plumb-chime', () => events.emit('plumb-chime', { machine: plumb, x: plumb.position.x, z: plumb.position.z }));
  const setState = (m, s) => () => { const prev = m.state; m.state = s; events.emit('machine-state', { machine: m, state: s, prev }); };
  at(80, 'plumb suspicious', setState(plumb, 'suspicious'));
  at(83, 'plumb patrol', setState(plumb, 'patrol'));
  at(84, 'sighting-off', () => { ctx.sighting.active = false; events.emit('sighting-off'); });
  at(84.2, 'plumb away', () => park(plumb));
  // the fight on the dyke: the Plumb at 25 m, three Pegs closing from 30 to 6 m
  const F = 118;
  at(F, 'fight staged', () => {
    const p = player.position;
    face = { x: 0, z: -1 };
    place(plumb, p.x - 5, p.z - 24.5);
    pegs.forEach((m, i) => place(m, p.x + 8 + i * 4, p.z - 27 - i));
  });
  at(F + 0.5, 'plumb suspicious', setState(plumb, 'suspicious'));
  at(F + 1.0, 'peg suspicious', setState(pegs[0], 'suspicious'));
  at(F + 2.0, 'plumb alert', setState(plumb, 'alert'));
  pegs.forEach((m, i) => at(F + 2.3 + 0.3 * i, 'peg alert', setState(m, 'alert')));
  at(F + 2.9, 'plumb attack', setState(plumb, 'attack'));
  for (let k = 0; k < 4; k++) {
    const t = F + 4 + k * 4.5;
    at(t, 'nock', () => { combat.nockLanded = true; });
    at(t + 0.5, 'draw', () => { combat._draw = { t0: t + 0.5 }; });
    at(t + 2.0, 'arrow-fired', () => { combat._draw = null; combat.drawStrength = 0; combat.nockLanded = false; events.emit('arrow-fired', { type: 'reed', drawStrength: 1, weapon: 'bow' }); });
    const pt = () => ({ x: plumb.position.x, y: plumb.position.y + 1.8, z: plumb.position.z });
    if (k === 3) at(t + 2.6, 'arrow-hit ground', () => events.emit('arrow-hit', { point: { x: plumb.position.x + 3, y: plumb.position.y, z: plumb.position.z + 2 }, type: 'reed', damage: 0 }));
    else at(t + 2.6, k === 1 ? 'arrow-hit vial' : 'arrow-hit', () => events.emit('arrow-hit', { point: pt(), machine: plumb, weak: k === 1, type: 'reed', damage: 14 }));
  }
  at(F + 9.5, 'pendulum', () => events.emit('machine-attack-phase', { machine: plumb, kind: 'pendulum', attack: 'pendulum', phase: 'windup' }));
  for (let k = 0; k < 6; k++) {
    at(F + 5 + k * 2.7, 'peg footfall', () => {
      const m = pegs[k % 3];
      const p = player.position;
      const d = 18 - k * 2;
      m.position.set(p.x + 0.4 * d, ground(p.x + 0.4 * d, p.z - 0.9 * d), p.z - 0.9 * d);
      events.emit('machine-footfall', { machine: m, position: m.position });
    });
  }
  at(F + 7, 'peg-shot', () => events.emit('machine-attack-phase', { machine: pegs[1], kind: 'peg-shot', attack: 'peg-shot', phase: 'strike' }));
  at(F + 12, 'swarm-rush', () => events.emit('machine-attack-phase', { machine: pegs[0], kind: 'swarm-rush', attack: 'swarm-rush', phase: 'windup' }));
  at(F + 13.5, 'mallet', () => { const p = player.position; pegs[0].position.set(p.x + 1.5, p.y, p.z - 3.6); events.emit('machine-attack-phase', { machine: pegs[0], kind: 'mallet', attack: 'mallet', phase: 'strike' }); });
  at(F + 13.6, 'player-hurt', () => { player.health = 78; events.emit('player-hurt', { health: 78, max: 100 }); });
  at(F + 14, 'plumb-topple', () => { const prev = plumb.state; plumb.state = 'downed'; events.emit('plumb-topple', { machine: plumb }); events.emit('machine-state', { machine: plumb, state: 'downed', prev }); });
  at(F + 15, 'machine-stagger', () => { const prev = pegs[0].state; pegs[0].state = 'stagger'; events.emit('machine-stagger', { machine: pegs[0], point: pegs[0].position }); events.emit('machine-state', { machine: pegs[0], state: 'stagger', prev }); });
  at(F + 20, 'lance draw', () => { combat.activeWeapon = { id: 'lance' }; combat.melee.stance = 'draw'; });
  at(F + 20.6, 'lance ready', () => { combat.melee.stance = 'ready'; });
  for (let k = 0; k < 5; k++) {
    const t = F + 21 + k * 1.3;
    at(t, 'strike', () => { combat.melee.phase = 'strike'; combat.melee.heavy = k === 4; });
    at(t + 0.25, 'melee-hit', () => { const m = pegs[0]; events.emit('melee-hit', { point: { x: m.position.x, y: m.position.y + 0.6, z: m.position.z }, machine: m, heavy: k === 4, crit: false }); });
    at(t + 0.6, 'recover', () => { combat.melee.phase = 'recover'; });
  }
  at(F + 28, 'pry', () => events.emit('pry', { machine: pegs[0], point: pegs[0].position }));
  const kill = (m, impact) => () => {
    m.alive = false; const prev = m.state; m.state = 'dead';
    events.emit('machine-state', { machine: m, state: 'dead', prev });
    events.emit('machine-killed', { machine: m });
    if (impact) setTimeout0(() => events.emit('machine-death-impact', { machine: m, position: m.position, strength: 0.4 }), 0.8);
  };
  const later = [];
  const setTimeout0 = (fn, s) => later.push([T + s, fn]);
  at(F + 28.5, 'peg 0 killed', kill(pegs[0], true));
  at(F + 29.8, 'plumb killed', kill(plumb, false));
  at(F + 30, 'peg 1 killed', kill(pegs[1], false));
  at(F + 30.3, 'peg 2 calm', setState(pegs[2], 'patrol'));
  at(F + 31, 'lance away', () => { combat.melee.stance = 'idle'; combat.activeWeapon = { id: 'bow' }; });
  at(150.2, 'peg 2 away', () => park(pegs[2]));
  // the sprint: a hop and a landing
  at(158, 'player-jump', emit('player-jump', {}));
  at(158.6, 'player-land', emit('player-land', { fallHeight: 0.6 }));
  // the Brazier, a quick-make, the rest, the map, the triangle, the save
  at(177, 'brazier-kindled', () => { if (brazier.id != null) braziers.lit.add(brazier.id); events.emit('brazier-kindled', { id: brazier.id }); });
  at(179.3, 'ammo-crafted', emit('ammo-crafted', { ammo: 'reed', n: 6 }));
  at(181, 'brazier-rest-start', emit('brazier-rest-start', {}));
  at(184, 'ui-open map', emit('ui-open', { screen: 'hub', tab: 'map' }));
  at(185.2, 'ui-nav tab', emit('ui-nav', { tab: 'quests' }));
  at(185.8, 'ui-nav', emit('ui-nav', {}));
  at(186.5, 'triangle-closed', emit('triangle-closed', {}));
  at(188, 'ui-confirm', emit('ui-confirm', {}));
  at(188.3, 'save-written', emit('save-written', {}));
  at(189, 'ui-close', emit('ui-close', {}));
  E.sort((a, b) => a[0] - b[0]);

  /* ---------------------------------------------------------------- the second GameAudio, on the offline context */
  const realAC = window.AudioContext, realWAC = window.webkitAudioContext;
  let ga;
  try {
    window.AudioContext = function OfflineStandIn() { return oc; };
    window.webkitAudioContext = window.AudioContext;
    ga = new GameAudio(ctx);
    ga.settings = { ...DEFAULT_VOLUMES };
    ga._init();
  } finally {
    window.AudioContext = realAC; window.webkitAudioContext = realWAC;
  }
  if (ga.ac !== oc) return { error: 'GameAudio did not take the offline context' };
  clearInterval(ga._stateWatch);
  await ga.bankReady;
  if (!ga.slice?.ready) return { error: 'the cue director did not start on the offline context', bank: ga.bank.audit?.() };

  // every synthesized voice that plays, by the method that asked for it (GameAudio._voice is every synth's output)
  const synth = {};
  const voice0 = ga._voice.bind(ga);
  ga._voice = (dur, vol, pan, bus) => {
    const st = (new Error().stack || '').split('\n');
    const who = (st[2] || '').trim().replace(/^at\s+/, '').split(' ')[0].replace(/^GameAudio\./, '').replace(/^ga\./, '');
    synth[who] = (synth[who] || 0) + 1;
    return voice0(dur, vol, pan, bus);
  };

  /* ---------------------------------------------------------------- the steps */
  let T = 0;
  let ei = 0;
  const rnd = seeded(seed);
  const perfNow = performance.now.bind(performance);
  const mathRandom = Math.random;
  const realST = window.setTimeout;
  const WALL0 = perfNow() + 5000;          // a render-clock "performance.now()" ahead of every wall time GameAudio kept
  let reduction = 0, engagedSteps = 0, minRed = 0;
  const redAt = [];
  const segAt = (t) => segs.find((s) => t >= s.a && t < s.b) || segs[segs.length - 1];
  const fired = [];
  const stepAt = (t) => {
    T = t;
    performance.now = () => WALL0 + T * 1000;
    Math.random = rnd;
    window.setTimeout = () => 0;
    try {
      // the stand-in player along her segment
      const s = segAt(t);
      const k = s.b > s.a ? Math.min(1, (t - s.a) / (s.b - s.a)) : 0;
      const x = s.from.x + (s.to.x - s.from.x) * k, z = s.from.z + (s.to.z - s.from.z) * k;
      place(player, x, z);
      const dx = s.to.x - s.from.x, dz = s.to.z - s.from.z, L = Math.hypot(dx, dz);
      player.moveSpeed = L > 0.01 ? (s.speed ?? L / (s.b - s.a)) : 0;
      player.crouching = !!s.crouch;
      player.inReedCover = !!s.reed && Math.hypot(x - rIn.x, z - rIn.z) < 4;
      if (L > 0.01 && !(t >= F && t < 150)) face = { x: dx / L, z: dz / L };
      look();
      if (reeds) reeds.t = 400 + t;        // the island's reed clocks, read at the walk's time
      // the bow's draw
      if (combat._draw) combat.drawStrength = Math.min(1, (t - combat._draw.t0) / 1.2);
      // events due
      while (ei < E.length && E[ei][0] <= t + 1e-9) { const e = E[ei++]; e[1](); fired.push(e[2]); }
      for (let i = later.length - 1; i >= 0; i--) if (later[i][0] <= t) { const f = later[i][1]; later.splice(i, 1); f(); }
      ga.update(step, t);
      // the master limiter's gain reduction (dB, <= 0) as the DynamicsCompressor reports it
      reduction = ga.comp.reduction ?? 0;
      if (reduction < minRed) { minRed = reduction; }
      if (reduction < -0.05) { engagedSteps++; if (redAt.length < 40) redAt.push([+t.toFixed(2), +reduction.toFixed(2)]); }
    } finally {
      performance.now = perfNow; Math.random = mathRandom; window.setTimeout = realST;
    }
  };
  stepAt(0);
  let n = 0;
  const N = Math.floor(sec / step) - 1;
  const schedule = () => {
    n++;
    if (n > N) return;
    const t = n * step;
    oc.suspend(t).then(() => {
      try { stepAt(t); } catch (e) { fired.push(`ERROR step ${t.toFixed(3)}: ${String(e && e.message || e)}`); }
      schedule();
      oc.resume();
    }, (e) => { fired.push(`ERROR suspend ${t.toFixed(3)}: ${String(e && e.message || e)}`); schedule(); });
  };
  schedule();
  const buf = await oc.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const mix = [L, R];

  /* ---------------------------------------------------------------- the numbers */
  const lufs = integratedLufs(mix);
  const tp = truePeakDb(mix);
  const sp = samplePeakDb(mix);
  const peaks = [];
  {
    const hop = Math.round(0.5 * SR);
    const blocks = [];
    for (let i = 0; i < L.length; i += hop) {
      let pk = 0, a = i;
      for (let j = i; j < Math.min(L.length, i + hop); j++) { const v = Math.max(Math.abs(L[j]), Math.abs(R[j])); if (v > pk) { pk = v; a = j; } }
      blocks.push([pk, a / SR]);
    }
    blocks.sort((p, q) => q[0] - p[0]);
    for (const [pk, t] of blocks.slice(0, 6)) peaks.push({ t: +t.toFixed(2), db: +(20 * Math.log10(pk)).toFixed(2), near: E.filter((e) => e[0] <= t && e[0] > t - 0.8).map((e) => `${e[2]}@${e[0]}`) });
  }
  const st5 = shortTermSeries ? shortTermSeries(mix, 5).map((v) => +v.toFixed(1)) : null;
  const cues = ga.cueCounts ? ga.cueCounts() : null;
  const out = {
    seconds: sec, step, sampleRate: SR, renderMs: Math.round(performance.now() - t0wall),
    loudness: { integratedLufs: +lufs.toFixed(2), target: '-18 +- 2', pass: Math.abs(lufs + 18) <= 2 },
    truePeak: { dBTP: +tp.toFixed(2), samplePeakDb: +sp.toFixed(2), bar: '<= -1', pass: tp <= -1 },
    shortTermMaxLufs: +shortTermMax(mix).toFixed(2),
    shortTerm5s: st5,
    limiter: { node: 'DynamicsCompressorNode (src/audio/buses.js)', settings: LIMITER, maxReductionDb: +minRed.toFixed(2), engagedS: +(engagedSteps * step).toFixed(2), firstEngaged: redAt },
    peaks,
    places: { street: street(2), pump: { x: pump.x, z: pump.z }, sluice: sl, realKeeper: !!realKeeper, reed, brazier },
    slice: ga.slice.stats(),
    synth,
    cues,
    played: ga._sampleCounts ? { ...ga._sampleCounts } : null,
    fired: fired.length, errors: fired.filter((f) => /^ERROR/.test(f)),
    voiceCapNote: 'the offline context is suspended whenever the game code runs, so GameAudio._voice skips its voice-cap bookkeeping (it counts only while running): no synth voice is refused here that the live cap might refuse',
  };
  try { ga.slice.dispose(); } catch { /* done */ }
  return out;
}
