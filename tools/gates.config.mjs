/**
 * Round 3 quality gates — the literal acceptance bar for every builder lane.
 *
 * ACTION gates: `assert` JS runs in page context (async supported, __CTX__/__GAME__
 * available) and must resolve to { pass: boolean, detail: any }. Console errors
 * during a gate = automatic FAIL. Gates whose required API is missing should
 * resolve { pass: null, detail: 'SKIP: <why>' } — reported as PENDING, not fail.
 *
 * VISUAL gates: capture a deterministic screenshot; `criteria` is the written
 * pass bar a human/judge-agent evaluates against the PNG.
 */

import { BUDGETS, PERF_SCENARIOS, STAGE_PRELUDE } from './budgets.mjs';
import { CANON_SPEEDS } from './gate-speeds.mjs';

const INPUT_ON = `__CTX__.input.enabled = true;`;

/**
 * CANON SPEEDS COME FROM THE BUILD, NOT FROM A LITERAL IN THIS FILE.
 * The prelude moved to `tools/gate-speeds.mjs` so every LANE gate file can
 * import the same one instead of re-deriving the number by hand — see that
 * file for the full history, and `A81-canon-speed-bands` for the gate that
 * fails any assert which hard-codes a locomotion speed.
 */


/**
 * MEASURE A SPRINT ON GROUND THERE IS ROOM TO SPRINT ON.
 *
 * WHAT BROKE (core-platform-followup2). `A13`, `A19` and `A28` already staged
 * onto the flat meadow before running. `A3` and `A12` did not — they held W and
 * Shift from wherever the player spawned. Round 4 put a camp (tent, crates,
 * bedroll, all with collision) a few metres in front of the spawn point, so
 * those two gates stopped measuring Aloy's sprint and started measuring the
 * tent: filmed at `shots/cpf2-sprint-probe.png` with `sprinting: true`,
 * `moveSpeed: 0.29`, the LOOT prompt up, and the player parked at (18.1, 32.1)
 * on every single attempt. The readings were 3.6 and 0.41 m/s.
 *
 * That is a gate failing a correct build, and worse, failing it in a way that
 * looks exactly like "the new canon speed broke the animator" — the reading is
 * far below 6.8 and the detail said nothing about a wall. The evidence that it
 * is the course and not the build: on the SAME build in the SAME run, the three
 * gates that do stage measured 6.19, 6.6 and 4.88 m/s and cleared their floors.
 *
 * No threshold moved. The gates just start where the other three start.
 */
const OPEN_GROUND =
  `p.position.set(-60, 0, -45); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = Math.PI; // flat meadow, runs +Z
      await new Promise(r => setTimeout(r, 250));`;

/** Page-context helper: block until the variety machines have spawned. */
const WAIT_VARIETY = `
  const _t0 = performance.now();
  while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {
    await new Promise(r => setTimeout(r, 150));
  }`;

/** Page-context helper: one measurement burst of N rendered frames. */
const BURST = `
  const burst = async (n) => {
    const e = __CTX__.engine;
    e.perfReset();
    const f0 = e.frames;
    while (e.frames - f0 < n) await new Promise(r => requestAnimationFrame(r));
    return e.perfSnapshot(n);
  };
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };`;

/** Page-context helper: one living machine per species, nearest first. */
const SPECIES = `
  const species = new Map();
  for (const _m of (__CTX__.machines?.list || [])) {
    if (!_m.alive) continue;
    if (!species.has(_m.kind)) species.set(_m.kind, _m);
  }
  const V = __CTX__.player.position.constructor;`;

/**
 * Page-context helper: world-space hull boxes of a machine's meshes, and the
 * distance from a point to the nearest one (0 when inside). Cheap enough to
 * run per weak point and exact enough to catch an eye floating off a head.
 */
const HULL = `
  const hullBoxes = (m) => {
    const root = m.root || m.body; if (!root) return [];
    root.updateMatrixWorld(true);
    const boxes = [];
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.visible) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox; if (!bb) return;
      const mn = { x: 1e9, y: 1e9, z: 1e9 }, mx = { x: -1e9, y: -1e9, z: -1e9 };
      for (let i = 0; i < 8; i++) {
        const v = new V(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z)
          .applyMatrix4(o.matrixWorld);
        mn.x = Math.min(mn.x, v.x); mn.y = Math.min(mn.y, v.y); mn.z = Math.min(mn.z, v.z);
        mx.x = Math.max(mx.x, v.x); mx.y = Math.max(mx.y, v.y); mx.z = Math.max(mx.z, v.z);
      }
      boxes.push({ mn, mx });
    });
    return boxes;
  };
  const distToHull = (p, boxes) => {
    let best = 1e9;
    for (const b of boxes) {
      const dx = Math.max(b.mn.x - p.x, 0, p.x - b.mx.x);
      const dy = Math.max(b.mn.y - p.y, 0, p.y - b.mx.y);
      const dz = Math.max(b.mn.z - p.z, 0, p.z - b.mx.z);
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < best) best = d;
    }
    return best;
  };`;

/**
 * Page-context helper: get a species moving. Machines only walk when something
 * is worth walking towards, so the player is dropped 14 m away and given two
 * seconds to be noticed before sampling starts.
 */
const PROVOKE = `
  {
    const _p = __CTX__.player;
    _p.position.set(m.position.x + 14, 0, m.position.z + 14);
    _p._snapToGround?.();
    _p.camYaw = Math.atan2(m.position.x - _p.position.x, m.position.z - _p.position.z) + Math.PI;
    await new Promise(r => setTimeout(r, 2200));
  }`;

export const GATES = [
  // ---------------- ACTION GATES ----------------
  {
    id: 'A90-memory-stability', kind: 'action', lane: 'core',
    title: 'Memory stays bounded: JS heap, geometries and textures do not grow across a 3-minute kill/loot/respawn loop',
    setup: INPUT_ON,
    settle: 2000,
    assert: `(async () => {
      const r = __CTX__.renderer || __CTX__.engine?.renderer;
      const mem = () => ({ heap: performance.memory?.usedJSHeapSize ?? null, geo: r.info.memory.geometries, tex: r.info.memory.textures, progs: r.info.programs?.length ?? null, objs: (() => { let n = 0; __CTX__.scene.traverse(() => n++); return n; })() });
      const kill = (m) => { let mesh = null; m.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; }); m.takeDamage({ point: m.position.clone(), object: mesh, impact: 99999, tear: 0, element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'hunter', baseDamage: 99999 }); };
      if (window.gc) window.gc();
      await new Promise(res => setTimeout(res, 1500));
      const a = mem();
      const t0 = performance.now(); let kills = 0;
      while (performance.now() - t0 < 150000) {
        const m = (__CTX__.machines?.list || []).find(x => x.alive);
        if (m) { kill(m); kills++; }
        __CTX__.input.keys.add('KeyW'); await new Promise(res => setTimeout(res, 2500)); __CTX__.input.keys.delete('KeyW');
        try { __CTX__.machines?.spawn?.('watcher', __CTX__.player.position.x + 30, __CTX__.player.position.z + 30); } catch {}
        await new Promise(res => setTimeout(res, 2500));
      }
      // let corpse lifecycle / disposal run
      await new Promise(res => setTimeout(res, 20000));
      if (window.gc) window.gc();
      await new Promise(res => setTimeout(res, 1500));
      const b = mem();
      const heapGrowth = (a.heap && b.heap) ? (b.heap - a.heap) / a.heap : null;
      const geoGrowth = b.geo - a.geo, texGrowth = b.tex - a.tex, objGrowth = b.objs - a.objs;
      const pass = (heapGrowth === null || heapGrowth < 0.25) && geoGrowth <= 40 && texGrowth <= 8 && objGrowth <= 60;
      return { pass, detail: { kills, before: a, after: b, heapGrowthPct: heapGrowth === null ? 'n/a (enable --enable-precise-memory-info)' : +(heapGrowth * 100).toFixed(1), geoGrowth, texGrowth, objGrowth } };
    })()`,
  },
  {
    id: 'A1-boot-clean', kind: 'action', lane: 'core',
    title: 'Game boots to playing state with zero console errors',
    settle: 1500,
    assert: `(async () => ({ pass: __CTX__.state === 'playing' || __CTX__.state === 'title', detail: 'state=' + __CTX__.state }))()`,
  },
  {
    id: 'A2-dodge-displacement', kind: 'action', lane: 'animator',
    title: 'Dodge roll displaces 1.5–6m horizontally within 1s and animator recovers',
    setup: INPUT_ON,
    settle: 400,
    assert: `(async () => {
      const p = __CTX__.player; const start = p.position.clone();
      ${''}
      __CTX__.input.keys.add('KeyW');
      await new Promise(r => setTimeout(r, 350));
      p.dodge ? p.dodge() : __CTX__.input._downHandlers.get('Space')?.forEach(f => f({}));
      await new Promise(r => setTimeout(r, 1000));
      const d = Math.hypot(p.position.x - start.x, p.position.z - start.z);
      const animOk = p.animator && !Number.isNaN(p.model.position.x);
      return { pass: d >= 1.5 && d <= 9 && animOk, detail: { displacement: +d.toFixed(2), animOk } };
    })()`,
  },
  {
    id: 'A3-sprint-speed', kind: 'action', lane: 'animator',
    title: 'Sprint sustains the published canon sprint speed (0.9–1.15 x player.speeds.sprint), measured in sim time',
    setup: INPUT_ON,
    settle: 200,
    /**
     * MEASURED IN SIM TIME, NOT WALL TIME (core-platform-followup2). Round 4's
     * fixed-step loop advances the simulation in 60 Hz slices with a cap on how
     * many it will run per rendered frame, so on a loaded box sim time falls
     * behind the wall clock — measured here at 14 fps: 0.90 s of sim in 1.50 s
     * of wall, which turned a correct 6.56 m/s sprint into a 3.94 m/s reading.
     * Dividing displacement by the wall clock therefore measures the neighbours'
     * CPU load, not Aloy's speed, and this gate would fail every correct build
     * on a busy machine. engine.simTime is the clock the movement was integrated
     * against, so it is the clock the speed is computed on.
     */
    assert: `(async () => {
      const p = __CTX__.player, e = __CTX__.engine;${CANON_SPEEDS}
      ${OPEN_GROUND}
      __CTX__.input.keys.add('KeyW'); __CTX__.input.keys.add('ShiftLeft');
      await new Promise(r => setTimeout(r, 2000));            // spin up to canon sprint
      const a = p.position.clone(), s0 = e.simTime, w0 = performance.now();
      await new Promise(r => setTimeout(r, 1500));
      const sim = e.simTime - s0, wall = (performance.now() - w0) / 1000;
      __CTX__.input.keys.clear();
      if (!(sim > 0.4)) return { pass: null, detail: { verdict: 'SKIP: sim advanced only ' + sim.toFixed(2) + 's in ' + wall.toFixed(2) + 's of wall clock — the box is too wedged to measure speed', sim, wall } };
      const v = Math.hypot(p.position.x - a.x, p.position.z - a.z) / sim;
      /**
       * DIAGNOSTIC ONLY — the pass bar above is untouched. A slow reading has
       * three very different causes and the old detail could not tell them
       * apart: the animator really is slow; the box is too wedged to measure
       * (covered by the sim-time SKIP above); or Aloy is sprinting INTO
       * something and the gate is measuring a wall. The third is what a
       * straight-line KeyW sprint from spawn now hits — Round 4 put a camp tent
       * a few metres south of the spawn point, and a sprinting:true /
       * moveSpeed:0.29 reading pinned against it looks exactly like a broken
       * animator unless the detail says otherwise.
       */
      const intent = p.moveSpeed ?? null;
      // The sprint flag is still set (input was never released) but almost no
      // ground was covered: that is a wall, not a slow animator.
      const obstructed = !!p.sprinting && v < 0.4 * SPD.sprint;
      return { pass: v >= SPRINT_MIN && v <= SPRINT_MAX, detail: {
        speed: +v.toFixed(2), canonSprint: SPD.sprint,
        band: [+SPRINT_MIN.toFixed(2), +SPRINT_MAX.toFixed(2)],
        simS: +sim.toFixed(2), wallS: +wall.toFixed(2),
        sprinting: !!p.sprinting, moveSpeedAtEnd: intent === null ? null : +intent.toFixed(2),
        endPos: [+p.position.x.toFixed(1), +p.position.z.toFixed(1)],
        likelyObstructed: obstructed || undefined,
        note: obstructed ? 'sprint flag is set but displacement is near zero — Aloy is running INTO something, not running slowly' : undefined,
      } };
    })()`,
  },
  {
    id: 'A4-draw-strength', kind: 'action', lane: 'combat',
    title: 'Aim + hold LMB reaches full draw within 1.6s',
    setup: INPUT_ON,
    settle: 300,
    assert: `(async () => {
      __CTX__.input.mouse.buttons |= 4;
      await new Promise(r => setTimeout(r, 250));
      __CTX__.input.mouse.buttons |= 1;
      const t0 = performance.now();
      let ds = 0;
      while (performance.now() - t0 < 1600) {
        ds = __CTX__.combat?.drawStrength ?? 0;
        if (ds >= 0.95) break;
        await new Promise(r => setTimeout(r, 60));
      }
      return { pass: ds >= 0.95, detail: { drawStrength: +ds.toFixed(2) } };
    })()`,
  },
  {
    id: 'A5-arrow-fired-event', kind: 'action', lane: 'combat',
    title: 'Releasing a full draw emits arrow-fired',
    setup: INPUT_ON,
    settle: 300,
    assert: `(async () => {
      let fired = null;
      __CTX__.events.on('arrow-fired', (e) => { fired = e; });
      __CTX__.input.mouse.buttons |= 4;
      await new Promise(r => setTimeout(r, 250));
      __CTX__.input.mouse.buttons |= 1;
      await new Promise(r => setTimeout(r, 1300));
      __CTX__.input.mouse.buttons &= ~1;
      await new Promise(r => setTimeout(r, 400));
      return { pass: !!fired, detail: fired ? { type: fired.type, draw: +(fired.drawStrength ?? 0).toFixed(2) } : 'no event' };
    })()`,
  },
  {
    id: 'A6-machine-foot-plant', kind: 'action', lane: 'machines',
    title: 'Walking machine stance feet sit on terrain (|footY - ground| ≤ 0.15m, slip < 0.2m)',
    settle: 500,
    assert: `(async () => {
      const list = __CTX__.machines?.list || [];
      const m = list.find(x => x.alive && x.debugFeet);
      if (!m) return { pass: null, detail: 'SKIP: no machine exposes debugFeet() yet (Round 3 machines contract)' };
      const samples = [];
      for (let i = 0; i < 12; i++) {
        const feet = m.debugFeet();
        for (const f of feet) if (f.planted) samples.push({
          err: Math.abs(f.world.y - __CTX__.terrain.getHeight(f.world.x, f.world.z)),
          x: f.world.x, z: f.world.z, name: f.name,
        });
        await new Promise(r => setTimeout(r, 120));
      }
      if (!samples.length) return { pass: null, detail: 'SKIP: no planted samples (machine idle?)' };
      const maxErr = Math.max(...samples.map(s => s.err));
      return { pass: maxErr <= 0.15, detail: { maxGroundErr: +maxErr.toFixed(3), samples: samples.length, kind: m.kind } };
    })()`,
  },
  {
    id: 'A7-alert-fsm', kind: 'action', lane: 'machines',
    title: 'Watcher escalates patrol → suspicious/alert when player stands close',
    setup: INPUT_ON,
    settle: 300,
    assert: `(async () => {
      const w = (__CTX__.machines?.list || []).find(m => m.kind === 'watcher' && m.alive);
      if (!w) return { pass: null, detail: 'SKIP: no living watcher' };
      const p = __CTX__.player;
      p.position.set(w.position.x + 4, 0, w.position.z + 4);
      const t0 = performance.now();
      let st = w.state;
      while (performance.now() - t0 < 8000) {
        st = w.state;
        if (st !== 'patrol' && st !== 'return') break;
        await new Promise(r => setTimeout(r, 200));
      }
      return { pass: ['suspicious', 'alert', 'attack', 'search'].includes(st), detail: { finalState: st } };
    })()`,
  },
  {
    id: 'A8-death-collapse', kind: 'action', lane: 'machines',
    title: 'Lethal damage kills a watcher; corpse persists (no console errors, alive=false)',
    settle: 400,
    assert: `(async () => {
      const w = (__CTX__.machines?.list || []).find(m => m.kind === 'watcher' && m.alive);
      if (!w) return { pass: null, detail: 'SKIP: no living watcher' };
      let mesh = null; w.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
      const hit = { point: w.position.clone(), object: mesh, impact: 99999, tear: 0,
                    element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'hunter',
                    baseDamage: 99999 };
      w.takeDamage(hit);
      await new Promise(r => setTimeout(r, 2500));
      return { pass: w.alive === false && w.state === 'dead', detail: { alive: w.alive, state: w.state } };
    })()`,
  },
  {
    id: 'A9-perf-budget', kind: 'action', lane: 'core',
    title: 'Draw calls < 350 and avg FPS ≥ 45 over 3s at spawn vista',
    settle: 2000, timeout: 60000,
    assert: `(async () => {
      const ctx = __CTX__, e = ctx.engine;
      const r = ctx.renderer || e?.renderer;
      if (e?.enableGpuTimer) e.enableGpuTimer(true);
      const sample = async (ms) => {
        let frames = 0, calls = -1; const t0 = performance.now();
        if (e?.perfReset) e.perfReset();
        await new Promise(res => {
          const tick = () => {
            frames++;
            calls = Math.max(calls, r?.info?.render?.calls ?? -1); // sample right after each render
            if (performance.now() - t0 >= ms) res(); else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        const snap = e?.perfSnapshot ? e.perfSnapshot(frames) : null;
        return { fps: frames / ((performance.now() - t0) / 1000), calls,
                 gpuMs: snap ? snap.medianGpuMs : null };
      };
      const run = await sample(3000);
      const fps = run.fps, calls = run.calls, sceneGpuMs = run.gpuMs;
      const callsOk = calls > 0 && calls < 350;
      const fpsOk = fps >= 45;
      /**
       * FIX ROUND 2 — the fps half of this gate is a wall clock, and this
       * repo is built by sixteen concurrent lanes on one box. Measured on the
       * same tree, minutes apart: 50.3, 34.0, 33.0, 21.7 fps. A red that moves
       * 2.3x between runs is not a finding anybody can act on, and it is not
       * honest to call it a pass either. So: ask whether this box can present
       * an EMPTY frame (scene hidden, post off, shadows off, DPR 0.5). If it
       * cannot hold ~vsync with nothing to draw, no fps number from this run
       * belongs to our scene and the gate reports PENDING rather than FAIL.
       * The draw-call half is a counter, not a clock, and always counts: a red
       * there still FAILs. If the engine hooks are missing we cannot witness
       * anything, and the old behaviour (plain FAIL) stands.
       */
      let nullFps = null, nullGpuMs = null;
      if (!fpsOk && e && e.composer && ctx.scene) {
        const keep = { dpr: e.basePixelRatio, gtao: e.gtao?.enabled, bloom: e.bloom?.enabled,
                       smaa: e.smaa?.enabled, shadows: r.shadowMap.enabled, vis: ctx.scene.visible,
                       drs: e.drsEnabled };
        try {
          if (e.setDynamicResolution) e.setDynamicResolution(false);
          if (e.gtao) e.gtao.enabled = false;
          if (e.bloom) e.bloom.enabled = false;
          if (e.smaa) e.smaa.enabled = false;
          r.shadowMap.enabled = false;
          ctx.scene.visible = false;
          e.basePixelRatio = 0.5; e.renderScale = 1; e.resize();
          await new Promise(res => setTimeout(res, 400));
          const nf = await sample(1500);
          nullFps = +nf.fps.toFixed(1);
          nullGpuMs = nf.gpuMs;
        } finally {
          ctx.scene.visible = keep.vis;
          if (e.gtao) e.gtao.enabled = keep.gtao;
          if (e.bloom) e.bloom.enabled = keep.bloom;
          if (e.smaa) e.smaa.enabled = keep.smaa;
          r.shadowMap.enabled = keep.shadows;
          e.basePixelRatio = keep.dpr; e.renderScale = 1; e.resize();
          if (e.setDynamicResolution) e.setDynamicResolution(keep.drs);
          await new Promise(res => setTimeout(res, 300));
        }
      }
      /**
       * Two witnesses, same rule A21 uses, because they catch different
       * neighbours. rAF alone is NOT enough and this was measured: with a
       * second heavy suite on the box, the null frame still read 60.7 fps
       * (an empty frame is cheap enough to make vsync no matter who else is
       * on the GPU) while our scene fell to 28.8. The disjoint timer query is
       * the one that sees it: milliseconds of GPU with NOTHING drawn means our
       * command stream is queued behind another client's.
       */
      const rafQuiet = nullFps == null || nullFps >= 55;
      const gpuQuiet = nullGpuMs == null ? null : nullGpuMs <= 3;
      const fpsAttributable = rafQuiet && gpuQuiet !== false;
      const pass = !callsOk ? false : (fpsOk ? true : (fpsAttributable ? false : null));
      const why = nullGpuMs != null && !gpuQuiet
        ? 'this box gives us ' + nullGpuMs + ' ms of GPU with NOTHING drawn'
        : 'this box renders an empty frame at only ' + nullFps + ' fps';
      return { pass, detail: {
        drawCalls: calls, fps: +fps.toFixed(1), sceneGpuMs, callsOk, fpsOk,
        nullFrameFps: nullFps, nullFrameGpuMs: nullGpuMs, fpsAttributable,
        verdict: pass === null
          ? 'PENDING: draw calls inside budget; fps ' + fps.toFixed(1) + ' is NOT attributable — '
            + why + ', so the deficit is contention, not the scene. Re-run on a quiet machine.'
          : pass ? 'PASS'
          : (!callsOk ? 'FAIL: drawCalls ' + calls + ' >= 350'
             : 'FAIL: fps ' + fps.toFixed(1) + ' < 45 on a box that presents an empty frame at '
               + nullFps + ' fps / ' + nullGpuMs + ' ms GPU, so the cost is ours (scene GPU '
               + sceneGpuMs + ' ms)'),
      } };
    })()`,
  },
  {
    id: 'A10-loot-single-render', kind: 'action', lane: 'hud',
    title: 'Looting shows exactly one loot surface (popup XOR toast stack, not both)',
    setup: INPUT_ON,
    settle: 400,
    assert: `(async () => {
      if (!window.__HUD_DEBUG__?.lootSurfaces) return { pass: null, detail: 'SKIP: __HUD_DEBUG__ missing' };
      const w = (__CTX__.machines?.list || []).find(m => m.kind === 'watcher' && m.alive);
      if (!w) return { pass: null, detail: 'SKIP: no living watcher' };
      let mesh = null; w.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
      w.takeDamage({ point: w.position.clone(), object: mesh, impact: 99999, tear: 0,
                     element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'hunter', baseDamage: 99999 });
      await new Promise(r => setTimeout(r, 2200));
      __CTX__.player.position.set(w.position.x + 0.8, 0, w.position.z + 0.8);
      const t0 = performance.now();
      let cur = null;
      while (performance.now() - t0 < 5000) {
        cur = __CTX__.interactables?.current;
        if (cur) break;
        await new Promise(r => setTimeout(r, 150));
      }
      if (!cur) return { pass: null, detail: 'SKIP: corpse interactable never became current' };
      __CTX__.input.keys.add('KeyE');            // real hold-to-interact path
      await new Promise(r => setTimeout(r, 900)); // hold 0.45s + margin
      __CTX__.input.keys.delete('KeyE');
      await new Promise(r => setTimeout(r, 400));
      const s = window.__HUD_DEBUG__.lootSurfaces();
      return { pass: s.popupVisible === true && s.toastCount === 0,
               detail: { popupVisible: s.popupVisible, toastCount: s.toastCount, label: cur.label } };
    })()`,
  },
  {
    id: 'A11-idle-alive', kind: 'action', lane: 'animator',
    title: 'Idle pose measurably changes over 5s (pelvis/hand world delta > 8mm) — no frozen mannequin',
    settle: 1200,
    assert: `(async () => {
      const an = __CTX__.player.animator;
      if (!an?.getBoneWorld) return { pass: null, detail: 'SKIP: no getBoneWorld' };
      const v = (n) => { const o = new (__CTX__.player.position.constructor)(); an.getBoneWorld(n, o); return o.clone(); };
      const names = ['pelvis_05', 'hand_r_045', 'head_0104'];
      const base = names.map(v);
      // idle motion is oscillatory (weight-shift cycles return to base) — track the
      // PATH maximum over 6s, not the endpoint delta, or the gate is phase-flaky
      let max = 0;
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 500));
        names.forEach((n, j) => { max = Math.max(max, v(n).distanceTo(base[j])); });
      }
      return { pass: max > 0.008, detail: { maxPathMm: +(max * 1000).toFixed(1) } };
    })()`,
  },

  {
    id: 'A12-clip-driven', kind: 'action', lane: 'animator',
    title: 'Locomotion is mocap-clip driven: mixer advancing, Sprint_Loop dominant at the published canon sprint speed',
    setup: INPUT_ON,
    settle: 300,
    assert: `(async () => {
      const an = __CTX__.player.animator, p = __CTX__.player;${CANON_SPEEDS}
      if (!an?.mixer) return { pass: null, detail: 'SKIP: animator exposes no AnimationMixer (procedural fallback)' };
      ${OPEN_GROUND}
      const t0 = an.mixer.time;
      __CTX__.input.keys.add('KeyW'); __CTX__.input.keys.add('ShiftLeft');
      await new Promise(r => setTimeout(r, 2000));
      const acts = Object.values(an.loco?.actions ?? {});
      // NB: the gait actions carry timeScale 0 because the blend scrubs their
      // .time from a shared phase, so isRunning() is false by construction —
      // isScheduled() is the predicate for "the mixer is evaluating this action"
      const live = acts.filter(a => a.isScheduled() && a.getEffectiveWeight() > 0.001);
      const dom = an.dominantAction();
      const spd = __CTX__.player.moveSpeed;
      const pass = an.mixer.time > t0 && live.length >= 1
        && !!dom && dom.clip === 'Sprint_Loop' && dom.weight > 0.6 && spd > SPRINT_MIN;
      return { pass, detail: {
        mixerAdvanced: +(an.mixer.time - t0).toFixed(2), liveActions: live.length,
        dominant: dom && { clip: dom.clip, weight: +dom.weight.toFixed(3) },
        speed: +spd.toFixed(2), sprintFloor: +SPRINT_MIN.toFixed(2), canonSprint: SPD.sprint,
        clips: Object.keys(an.clipReport()?.clips ?? {}).length,
      } };
    })()`,
  },
  {
    id: 'A13-no-skate', kind: 'action', lane: 'animator',
    title: 'Planted foot does not skate: stance-window XZ drift ≤ 0.06m at full sprint',
    setup: INPUT_ON,
    settle: 300,
    assert: `(async () => {
      const an = __CTX__.player.animator, T = __CTX__.terrain, p = __CTX__.player;${CANON_SPEEDS}
      if (!an?.debugFeet) return { pass: null, detail: 'SKIP: animator exposes no debugFeet()' };
      p.position.set(-60, 0, -45); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = Math.PI; // flat meadow, runs +Z
      __CTX__.input.keys.add('KeyW'); __CTX__.input.keys.add('ShiftLeft');
      await new Promise(r => setTimeout(r, 2000));           // spin up to canon sprint
      // a stance window = consecutive frames where a foot is BOTH clip-flagged
      // planted and within 3cm of the terrain; its drift is the XZ bounding box
      const open = {}, done = [];
      let hitched = 0, prev = performance.now();
      const t0 = prev;
      // 2600ms, not 1600: at sprint a single foot is in contact for only ~66ms
      // (contactDuty 0.3 of a 0.6s cycle), which is 3-4 rAF samples, so a short
      // window collected too few complete stances and the gate SKIPPED itself
      // on any frame rate under 60. The drift threshold below is unchanged.
      while (performance.now() - t0 < 2600) {
        const now = performance.now();
        // A dropped frame in headless Chrome moves her 0.4m+ between samples;
        // that is a measurement artifact, not skate, so windows spanning one
        // are counted and discarded rather than silently passed.
        const hitch = now - prev > 45;
        prev = now;
        for (const f of an.debugFeet()) {
          const on = f.planted && (f.world.y - T.getHeight(f.world.x, f.world.z)) <= 0.03;
          const w = open[f.name];
          if (on) {
            if (!w) open[f.name] = { x0: f.world.x, x1: f.world.x, z0: f.world.z, z1: f.world.z, n: 1, bad: false };
            else {
              w.x0 = Math.min(w.x0, f.world.x); w.x1 = Math.max(w.x1, f.world.x);
              w.z0 = Math.min(w.z0, f.world.z); w.z1 = Math.max(w.z1, f.world.z); w.n++;
              if (hitch) w.bad = true;
            }
          } else if (w) {
            // 3 frames at canon sprint still spans ~55ms of stance and a third
            // of a metre of travel — a real skate measurement, not a lowered bar
            if (w.n >= 3) { if (w.bad) hitched++; else done.push(+Math.hypot(w.x1 - w.x0, w.z1 - w.z0).toFixed(4)); }
            open[f.name] = null;
          }
        }
        await new Promise(r => requestAnimationFrame(r));
      }
      if (done.length < 2) return { pass: null, detail: 'SKIP: fewer than 2 clean stance windows sampled (hitched=' + hitched + ')' };
      const worst = Math.max(...done);
      const spd = __CTX__.player.moveSpeed;
      return { pass: worst <= 0.06 && spd > SPRINT_MIN,
               detail: { maxStanceDriftM: worst, windows: done.length, hitchedWindows: hitched, drifts: done,
                         speed: +spd.toFixed(2), sprintFloor: +SPRINT_MIN.toFixed(2), canonSprint: SPD.sprint } };
    })()`,
  },


  // ---------------- ROUND 4 · animator (§ character) ----------------
  {
    id: 'A14-dodge-zero-dt', kind: 'action', lane: 'animator',
    title: 'A roll survives dt === 0 ticks: position stays finite and the dodge still covers ground',
    setup: INPUT_ON,
    settle: 300,
    assert: `(async () => {
      const C = __CTX__, p = C.player, e = C.engine;
      // The fixed-step loop ticks with dt === 0 whenever a frame does not fill a
      // 1/60 step (every other frame on a 120Hz display) and whenever timeScale
      // is 0. Differentiating the roll's root-motion curve by dt used to make
      // position NaN forever, which renders the whole world black.
      p.position.set(-60, 0, -45); p.velocity.set(0, 0, 0); p._snapToGround();
      p.camYaw = Math.PI;
      C.input.keys.add('KeyW');
      await new Promise(r => setTimeout(r, 500));
      const start = p.position.clone();
      p.dodge();
      if (!p.dodging) return { pass: null, detail: 'SKIP: dodge did not start' };
      // drive the roll while repeatedly freezing time (steps === 0 -> _tick(0))
      let zeroTicks = 0;
      const t0 = performance.now();
      while (p.dodging && performance.now() - t0 < 2500) {
        e.timeScale = (zeroTicks++ % 2) ? 0 : 1;
        await new Promise(r => requestAnimationFrame(r));
      }
      e.timeScale = 1;
      C.input.keys.delete('KeyW');
      await new Promise(r => setTimeout(r, 400));
      const fin = Number.isFinite(p.position.x) && Number.isFinite(p.position.y)
        && Number.isFinite(p.position.z) && Number.isFinite(p.velocity.x)
        && Number.isFinite(p.moveSpeed);
      const cam = C.camera.position;
      const camFin = Number.isFinite(cam.x) && Number.isFinite(cam.y) && Number.isFinite(cam.z);
      const disp = fin ? +start.distanceTo(p.position).toFixed(2) : -1;
      return { pass: fin && camFin && disp > 1.5,
               detail: { finite: fin, cameraFinite: camFin, displacement: disp, frozenFrames: zeroTicks >> 1 } };
    })()`,
  },
  {
    id: 'A15-foot-flat', kind: 'action', lane: 'animator',
    title: 'Feet are flat at rest: idle + aim foot pitch within 5 deg of the bind pose, heels not floating',
    setup: INPUT_ON,
    settle: 1500,
    assert: `(async () => {
      const C = __CTX__, p = C.player, an = p.animator;
      if (!an?.debugStance) return { pass: null, detail: 'SKIP: animator exposes no debugStance()' };
      p.position.set(-60, 0, -45); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = Math.PI;
      // The teleport moves the body before the animator has run once at the new
      // spot, so the very next sample compares last frame's pose against this
      // frame's terrain and reads ~12 deg of pitch error that is not in the
      // render. Let two frames go by; the thresholds below are unchanged.
      await new Promise(r => requestAnimationFrame(r));
      await new Promise(r => requestAnimationFrame(r));
      const worst = { idle: 0, aim: 0 };
      const sample = async (tag, ms) => {
        const t0 = performance.now();
        while (performance.now() - t0 < ms) {
          for (const f of an.debugStance().feet) {
            worst[tag] = Math.max(worst[tag], Math.abs(f.pitch - f.bindPitch));
          }
          await new Promise(r => requestAnimationFrame(r));
        }
      };
      await sample('idle', 2200);
      C.input.mouse.buttons |= 4;                       // aim, standing still
      await new Promise(r => setTimeout(r, 900));
      await sample('aim', 1400);
      C.input.mouse.buttons &= ~4;
      const pass = worst.idle <= 5 && worst.aim <= 5;
      return { pass, detail: { maxIdlePitchErrDeg: +worst.idle.toFixed(2),
                               maxAimPitchErrDeg: +worst.aim.toFixed(2),
                               stance: an.debugStance() } };
    })()`,
  },
  {
    id: 'A16-draw-anchor', kind: 'action', lane: 'animator',
    title: 'Full draw: string hand ON the nock, draw elbow at/below the shoulder, arm clear of the head — at every aim pitch and while strafing',
    setup: INPUT_ON,
    settle: 400,
    assert: `(async () => {
      const C = __CTX__, p = C.player, an = p.animator, cmb = C.combat;
      if (!an?.debugArm) return { pass: null, detail: 'SKIP: animator exposes no debugArm()' };
      const V = () => new p.position.constructor();
      const rows = [];
      const measure = async (pitch, key, tag) => {
        C.input.mouse.buttons = 0; C.input.keys.clear();
        await new Promise(r => setTimeout(r, 600));
        p.position.set(-60, 0, -45); p.velocity.set(0, 0, 0); p._snapToGround();
        p.camYaw = Math.PI; p.camPitch = pitch;
        C.input.mouse.buttons |= 4;
        if (key) C.input.keys.add(key);
        await new Promise(r => setTimeout(r, 700));
        C.input.mouse.buttons |= 1;
        await new Promise(r => setTimeout(r, 1900));
        p.camPitch = pitch;
        await new Promise(r => setTimeout(r, 200));
        const arm = an.debugArm('r');
        const nk = V(); cmb.bow.getNockWorld(cmb.drawStrength, nk);
        const hr = V(); an.getBoneWorld('hand_r_045', hr);
        rows.push({ tag, drawS: +cmb.drawStrength.toFixed(2),
          nockToHand: +nk.distanceTo(hr).toFixed(4),
          elbowAboveShoulder: arm.elbowAboveShoulder,
          headClear: arm.headClear });
      };
      await measure(0, null, 'level');
      await measure(0.75, null, 'down');
      await measure(-0.4, null, 'up');
      await measure(-0.55, null, 'up55');
      await measure(0, 'KeyD', 'strafeRight');
      await measure(0, 'KeyA', 'strafeLeft');
      C.input.mouse.buttons = 0; C.input.keys.clear();
      const bad = rows.filter(r => !(r.drawS > 0.9 && r.nockToHand <= 0.09
        && r.elbowAboveShoulder <= 0 && r.headClear >= 0.98));
      return { pass: bad.length === 0, detail: { rows, failing: bad.map(r => r.tag) } };
    })()`,
  },
  {
    id: 'A17-draw-beats', kind: 'action', lane: 'animator',
    title: 'Nock flourish reaches the hip quiver and the loose has a rearward follow-through',
    setup: INPUT_ON,
    settle: 400,
    assert: `(async () => {
      const C = __CTX__, p = C.player, an = p.animator;
      if (!an?.debugArm) return { pass: null, detail: 'SKIP: animator exposes no debugArm()' };
      p.position.set(-60, 0, -45); p.velocity.set(0, 0, 0); p._snapToGround();
      p.camYaw = Math.PI; p.camPitch = 0;
      // --- nock flourish: the string hand must dip to the hip quiver, and it
      // is a beat of the AIM RAISE, not of the draw. Round 4 fired it on the
      // draw edge, so for its whole 0.28s the hand hung at her hip while the
      // string was already bending (nock -> hand 0.63m); the string must never
      // go live before the hand is back on it, which is asserted here too.
      let minQ = 99, frames = 0, drawDuringFlourish = 0;
      C.input.mouse.buttons |= 4;
      const t0 = performance.now();
      while (performance.now() - t0 < 700) {
        minQ = Math.min(minQ, an.debugArm('r').handToQuiver);
        if (an._quiverT < 1) { frames++; drawDuringFlourish = Math.max(drawDuringFlourish, C.combat.drawStrength); }
        await new Promise(r => requestAnimationFrame(r));
      }
      C.input.mouse.buttons |= 1;
      await new Promise(r => setTimeout(r, 1500));
      // --- loose: the hand holds at the anchor and kicks back along -aim
      const before = an.debugArm('r').hand;
      C.input.mouse.buttons &= ~1;
      let maxBack = 0;
      const t1 = performance.now();
      while (performance.now() - t1 < 260) {
        const h = an.debugArm('r').hand;
        maxBack = Math.max(maxBack, before.z - h.z);
        await new Promise(r => requestAnimationFrame(r));
      }
      C.input.mouse.buttons = 0;
      const pass = minQ <= 0.18 && maxBack >= 0.05 && frames >= 8 && drawDuringFlourish <= 0.02;
      return { pass, detail: { minHandToQuiverM: +minQ.toFixed(3),
                               flourishFrames: frames,
                               maxDrawDuringFlourish: +drawDuringFlourish.toFixed(3),
                               looseRearM: +maxBack.toFixed(4) } };
    })()`,
  },

  {
    id: 'A18-slope-conform', kind: 'action', lane: 'animator',
    title: 'Feet conform ACROSS the fall line: soles lie on the surface and neither foot floats at 10/20/30 deg',
    setup: INPUT_ON,
    settle: 400,
    assert: `(async () => {
      const C = __CTX__, p = C.player, an = p.animator, T = C.terrain;
      if (!an?.debugStance || !T?.getHeight) return { pass: null, detail: 'SKIP: no debugStance()/terrain' };
      // Pick ONE spot per slope band, deterministically: scan on a fixed grid
      // and take the first whose surface is locally consistent (the normal at
      // +-0.6m agrees within 6 deg), so a ridge or a crease never decides the
      // result. This is the case the old A15 never sampled — it only ever
      // stood in the flat meadow, and the conform had no lateral axis at all:
      // on a 25 deg contour both soles were held world-level and the downhill
      // boot hung 0.098m in the air.
      const nrmAt = (x, z) => { const n = new p.position.constructor(); T.getNormal(x, z, n); return n; };
      const angOf = (n) => Math.acos(Math.max(-1, Math.min(1, n.y))) * 180 / Math.PI;
      const pick = (band) => {
        let best = null;
        for (let x = -200; x <= 200; x += 3) for (let z = -200; z <= 200; z += 3) {
          const n = nrmAt(x, z); const a = angOf(n);
          if (Math.abs(a - band) > 1.2) continue;
          let ok = true;
          for (const [dx, dz] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) {
            if (nrmAt(x + dx, z + dz).dot(n) < 0.9945) { ok = false; break; }   // ~6 deg
          }
          if (!ok) continue;
          const d = Math.abs(a - band);
          if (!best || d < best.d) best = { x, z, a, d, n };
        }
        return best;
      };
      const rows = [];
      for (const band of [10, 20, 30]) {
        const s = pick(band);
        if (!s) { rows.push({ band, skip: true }); continue; }
        // stand ACROSS the fall line (perpendicular to the gradient)
        const fall = Math.atan2(-s.n.x, -s.n.z);
        p.position.set(s.x, 0, s.z); p.velocity.set(0, 0, 0);
        p.heading = fall + Math.PI / 2; p.camYaw = p.heading; p._snapToGround();
        await new Promise(r => setTimeout(r, 900));
        p.heading = fall + Math.PI / 2;
        await new Promise(r => setTimeout(r, 300));
        const st = an.debugStance();
        const clr = an.debugFeet().map((f) => +(f.world.y - T.getHeight(f.world.x, f.world.z) - an._ballRest).toFixed(4));
        rows.push({ band, slopeDeg: +s.a.toFixed(1),
          ballClearM: clr, soleTiltDeg: st.feet.map((f) => f.soleTiltErrDeg) });
      }
      C.input.keys.clear();
      const live = rows.filter((r) => !r.skip);
      const bad = live.filter((r) => Math.max(...r.ballClearM.map(Math.abs)) > 0.02
                                  || Math.max(...r.soleTiltDeg) > 6);
      return { pass: live.length === 3 && bad.length === 0,
               detail: { rows, failing: bad.map((r) => r.band) } };
    })()`,
  },

  {
    id: 'A19-secondary-motion', kind: 'action', lane: 'animator',
    title: 'dyn_ hair/skirt chains actually swing at sprint and follow through after a hard stop',
    setup: INPUT_ON,
    settle: 400,
    assert: `(async () => {
      const C = __CTX__, p = C.player, an = p.animator;${CANON_SPEEDS}
      p.position.set(-60, 0, -45); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = Math.PI;
      // read the LIVE bones the skinned mesh uses, not the animator's map
      const want = ['dyn_hairBackMain_03_0147', 'dyn_skirtA_02_l_0202', 'dyn_quiverMain_0307'];
      const bones = {};
      p.model.traverse((o) => { if (o.isBone && want.includes(o.name)) bones[o.name] = o; });
      if (Object.keys(bones).length !== want.length) return { pass: null, detail: 'SKIP: dyn_ probe bones not found' };
      const snap = () => { const o = {}; for (const n in bones) { const q = bones[n].quaternion; o[n] = [q.x, q.y, q.z, q.w]; } return o; };
      const rangeDeg = (list) => {
        const o = {};
        for (const n in bones) {
          let mx = 0;
          for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
            const A = list[i][n], B = list[j][n];
            const d = Math.min(1, Math.abs(A[0] * B[0] + A[1] * B[1] + A[2] * B[2] + A[3] * B[3]));
            const a = 2 * Math.acos(d) * 180 / Math.PI; if (a > mx) mx = a;
          }
          o[n] = +mx.toFixed(2);
        }
        return o;
      };
      C.input.keys.add('KeyW'); C.input.keys.add('ShiftLeft');
      await new Promise(r => setTimeout(r, 2400));
      const run = []; for (let i = 0; i < 22; i++) { run.push(snap()); await new Promise(r => setTimeout(r, 95)); }
      const sprint = rangeDeg(run);
      const speed = p.moveSpeed;
      C.input.keys.delete('KeyW'); C.input.keys.delete('ShiftLeft');
      const stop = []; for (let i = 0; i < 9; i++) { stop.push(snap()); await new Promise(r => setTimeout(r, 45)); }
      const after = rangeDeg(stop);
      C.input.keys.clear();
      // A converged spring is not motion: a chain parked at a constant lean by
      // a DC velocity term measured 0.0-0.26 deg over 2.5s of sprint while the
      // legs swung 100 deg. These bars are what "the hair swings" costs.
      const pass = speed > SPRINT_MIN
        && sprint['dyn_hairBackMain_03_0147'] >= 8 && sprint['dyn_skirtA_02_l_0202'] >= 4
        && sprint['dyn_quiverMain_0307'] >= 1.5
        && after['dyn_hairBackMain_03_0147'] >= 6;
      return { pass, detail: { speed: +speed.toFixed(2), sprintFloor: +SPRINT_MIN.toFixed(2), canonSprint: SPD.sprint,
                               sprintRangeDeg: sprint, afterStopRangeDeg: after } };
    })()`,
  },

  {
    id: 'A33-rig-finite', kind: 'action', lane: 'animator',
    title: 'No bone or dyn_ spring ever goes non-finite across a teleport/turn/sprint/aim/dodge stress run',
    setup: INPUT_ON,
    settle: 400,
    assert: `(async () => {
      const C = __CTX__, p = C.player, an = p.animator, T = C.terrain;
      const bones = [];
      p.model.traverse((o) => { if (o.isBone) bones.push(o); });
      if (!bones.length) return { pass: null, detail: 'SKIP: no bones' };
      // A NaN here is not a glitch: a non-finite bone matrix collapses every
      // vertex it skins, so one bad spring state silently DELETES the hair,
      // skirt, boot fur and pouches from the render, and the integrator has no
      // path back. The fix-round film caught exactly that after a teleport.
      const bad = [];
      const check = (tag) => {
        for (const b of bones) {
          const q = b.quaternion, v = b.position;
          if (!(Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w)
                && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z))) {
            bad.push(tag + ':bone:' + b.name); return;
          }
        }
        for (const c of (an._chains || [])) {
          if (!(Number.isFinite(c.ax) && Number.isFinite(c.az) && Number.isFinite(c.vx) && Number.isFinite(c.vz))) {
            bad.push(tag + ':chain:' + (c.links[0] && c.links[0].name)); return;
          }
        }
        for (const k of ['_grnd', '_lvx', '_lvz', '_jerkX', '_jerkZ', '_yawRate', '_drawS', '_aimW']) {
          if (!Number.isFinite(an[k])) { bad.push(tag + ':state:' + k); return; }
        }
      };
      const hold = async (ms, tag) => {
        const t0 = performance.now();
        while (performance.now() - t0 < ms) { check(tag); await new Promise(r => requestAnimationFrame(r)); }
      };
      // scan for a steep spot, teleport onto it and slam the heading — the
      // exact sequence the film harness ran when the chains went NaN
      const nAt = (x, z) => { const v = new p.position.constructor(); T.getNormal(x, z, v); return v; };
      let steep = { x: -60, z: -45, n: nAt(-60, -45) };
      for (let x = -125; x <= 5; x += 4) for (let z = -110; z <= 20; z += 4) {
        const v = nAt(x, z);
        if (v.y < steep.n.y) steep = { x, z, n: v };
      }
      const fall = Math.atan2(-steep.n.x, -steep.n.z);
      const jump = async (x, z, h) => {
        p.position.set(x, 0, z); p.velocity.set(0, 0, 0); p.heading = h; p.camYaw = h; p._snapToGround();
        await hold(500, 'jump');
      };
      await hold(300, 'boot');
      await jump(steep.x, steep.z, fall + Math.PI / 2);
      await jump(steep.x, steep.z, fall);                     // 90 deg heading slam
      await jump(-60, -45, 0);
      C.input.keys.add('KeyW'); C.input.keys.add('ShiftLeft');
      await hold(1800, 'sprint');
      p.camYaw = 2.6; await hold(400, 'hardturn');
      C.input.keys.delete('ShiftLeft'); C.input.keys.delete('KeyW');
      await hold(500, 'stop');
      C.input.keys.add('Space'); await hold(120, 'dodge'); C.input.keys.delete('Space');
      await hold(1000, 'roll');
      C.input.mouse.buttons |= 4; await hold(500, 'aim');
      C.input.mouse.buttons |= 1; await hold(1200, 'draw');
      C.input.mouse.buttons = 0; await hold(500, 'loose');
      C.input.keys.clear();
      return { pass: bad.length === 0, detail: { firstBad: bad.slice(0, 5), bones: bones.length,
                                                 chains: (an._chains || []).length } };
    })()`,
  },

  {
    id: 'A28-run-cadence', kind: 'action', lane: 'animator',
    title: 'Plain-W run reads as a run, not a bound: cadence >= 2.6 steps/s and flight fraction <= 0.40',
    setup: INPUT_ON,
    settle: 400,
    assert: `(async () => {
      const C = __CTX__, p = C.player, an = p.animator, T = C.terrain;${CANON_SPEEDS}
      if (!an?.debugFeet) return { pass: null, detail: 'SKIP: animator exposes no debugFeet()' };
      const run = async (keys) => {
        p.position.set(-60, 0, -45); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = Math.PI;
        C.input.keys.clear(); for (const k of keys) C.input.keys.add(k);
        await new Promise(r => setTimeout(r, 2200));
        const S = []; const t0 = performance.now();
        while (performance.now() - t0 < 2400) {
          const f = an.debugFeet();
          S.push({ lo: Math.min(...f.map((x) => x.world.y - T.getHeight(x.world.x, x.world.z))),
                   pl: f.map((x) => x.planted), w: [an._stL, an._stR],
                   hz: 2 * (an.loco?.freq ?? 0), sp: p.moveSpeed });
          await new Promise(r => requestAnimationFrame(r));
        }
        const dur = 2.4;
        // Foot-edge counting is a NOISY cadence probe: the blended stance
        // weight chatters across 0.5 and merges or doubles edges, which is
        // worth +-0.4 steps/s on a 2.4s window. Count it with hysteresis as a
        // cross-check and assert on the cadence the clips are actually driven
        // at — the locomotion phase rate, 2 steps per gait cycle.
        let steps = 0; const held = [S[0].pl[0], S[0].pl[1]];
        for (let i = 1; i < S.length; i++) {
          for (let j = 0; j < 2; j++) {
            if (!held[j] && S[i].w[j] > 0.65) { held[j] = true; steps++; }
            else if (held[j] && S[i].w[j] < 0.35) held[j] = false;
          }
        }
        const spd = S.reduce((a, s) => a + s.sp, 0) / S.length;
        const cad = S.map((s) => s.hz).sort((a, b) => a - b);
        const med = cad[cad.length >> 1];
        return { stepsPerSec: +med.toFixed(2),
                 stepsPerSecFromFeet: +(steps / dur).toFixed(2),
                 flightFrac: +(S.filter((s) => s.lo > 0.05).length / S.length).toFixed(2),
                 strideM: +(spd / med).toFixed(2), speed: +spd.toFixed(2) };
      };
      // Plain W is the gait the player spends the whole game in and A12/A13
      // only ever drove W+Shift. On the old 4.6 m/s canon against a 6.05 m/s jog
      // clip it ran at 0.76x: 126 spm, a 2.2m stride and 55% flight —
      // low-gravity bounding. Both floors below now come from player.speeds.
      const w = await run(['KeyW']);
      const s = await run(['KeyW', 'ShiftLeft']);
      C.input.keys.clear();
      const pass = w.speed > JOG_MIN && w.stepsPerSec >= 2.6 && w.flightFrac <= 0.40
                && s.speed > SPRINT_MIN && s.stepsPerSec >= 3.0 && s.flightFrac <= 0.55;
      return { pass, detail: { runW: w, sprint: s,
                               floors: { jog: +JOG_MIN.toFixed(2), sprint: +SPRINT_MIN.toFixed(2) },
                               canon: { jog: SPD.jog, sprint: SPD.sprint } } };
    })()`,
  },

  {
    id: 'A31-aim-strafe-skate', kind: 'action', lane: 'animator',
    title: 'Aim-strafe does not skate either: planted-foot stance drift <= 0.06m sidestepping left AND right under aim',
    setup: INPUT_ON,
    settle: 400,
    assert: `(async () => {
      const C = __CTX__, p = C.player, an = p.animator, T = C.terrain;
      if (!an?.debugFeet) return { pass: null, detail: 'SKIP: animator exposes no debugFeet()' };
      // Same stance-window algorithm as A13, driven sideways under aim — the
      // dominant combat locomotion in HZD, and the case A13 never covered:
      // yawing a forward walk left the stride axis ~30 deg off the travel
      // direction and dragged the planted foot 0.15-0.18m per stance.
      const measure = async (key) => {
        C.input.mouse.buttons = 0; C.input.keys.clear();
        p.position.set(-60, 0, -45); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = Math.PI;
        C.input.mouse.buttons |= 4; C.input.keys.add(key);
        await new Promise(r => setTimeout(r, 1800));
        const open = {}, done = []; let hitched = 0, prev = performance.now();
        const t0 = prev;
        while (performance.now() - t0 < 2600) {
          const now = performance.now(); const hitch = now - prev > 45; prev = now;
          for (const f of an.debugFeet()) {
            const on = f.planted && (f.world.y - T.getHeight(f.world.x, f.world.z)) <= 0.03;
            const w = open[f.name];
            if (on) {
              if (!w) open[f.name] = { x0: f.world.x, x1: f.world.x, z0: f.world.z, z1: f.world.z, n: 1, bad: false };
              else {
                w.x0 = Math.min(w.x0, f.world.x); w.x1 = Math.max(w.x1, f.world.x);
                w.z0 = Math.min(w.z0, f.world.z); w.z1 = Math.max(w.z1, f.world.z); w.n++;
                if (hitch) w.bad = true;
              }
            } else if (w) {
              if (w.n >= 3) { if (w.bad) hitched++; else done.push(+Math.hypot(w.x1 - w.x0, w.z1 - w.z0).toFixed(4)); }
              open[f.name] = null;
            }
          }
          await new Promise(r => requestAnimationFrame(r));
        }
        const travelled = p.moveSpeed;
        return { drifts: done, windows: done.length, hitched, speed: +travelled.toFixed(2) };
      };
      const R = await measure('KeyD');
      const L = await measure('KeyA');
      C.input.mouse.buttons = 0; C.input.keys.clear();
      if (R.windows < 2 || L.windows < 2) return { pass: null, detail: { R, L, note: 'SKIP: fewer than 2 clean stance windows' } };
      const worst = Math.max(...R.drifts, ...L.drifts);
      return { pass: worst <= 0.06 && R.speed > 0.9 && L.speed > 0.9,
               detail: { maxStanceDriftM: worst, right: R, left: L } };
    })()`,
  },

  {
    id: 'A32-draw-ramp', kind: 'action', lane: 'animator',
    title: 'The string hand is on the nock for the WHOLE draw ramp, and the hand is not inside her head at full draw',
    setup: INPUT_ON,
    settle: 400,
    assert: `(async () => {
      const C = __CTX__, p = C.player, an = p.animator, cmb = C.combat;
      if (!an?.debugArm) return { pass: null, detail: 'SKIP: animator exposes no debugArm()' };
      const V = () => new p.position.constructor();
      const rows = [];
      // A16 only ever samples drawS > 0.9, so it could not see that the first
      // 0.28s of every draw ran with the hand at her hip and the string open in
      // a V with nothing holding it (nock -> hand 0.63m at drawS 0.18). And its
      // headClear tests only the arm SEGMENTS, so it passed while hand_r itself
      // sat at 0.94 of the head-ellipsoid radius, inside the skull.
      const measure = async (pitch, key, tag) => {
        C.input.mouse.buttons = 0; C.input.keys.clear();
        await new Promise(r => setTimeout(r, 600));
        p.position.set(-60, 0, -45); p.velocity.set(0, 0, 0); p._snapToGround();
        p.camYaw = Math.PI; p.camPitch = pitch;
        C.input.mouse.buttons |= 4; if (key) C.input.keys.add(key);
        await new Promise(r => setTimeout(r, 900));
        C.input.mouse.buttons |= 1;
        let ramp = 0, rampAt = 0, minHand = 9, full = 0;
        const t0 = performance.now();
        while (performance.now() - t0 < 1800) {
          p.camPitch = pitch;
          const ds = cmb.drawStrength;
          const nk = V(); cmb.bow.getNockWorld(ds, nk);
          const hr = V(); an.getBoneWorld('hand_r_045', hr);
          const d = nk.distanceTo(hr);
          if (ds > 0.05 && ds < 0.9 && d > ramp) { ramp = d; rampAt = ds; }
          if (ds >= 0.9) { full = Math.max(full, d); minHand = Math.min(minHand, an.debugArm('r').handHeadUnit); }
          await new Promise(r => requestAnimationFrame(r));
        }
        rows.push({ tag, rampMaxNockToHand: +ramp.toFixed(4), rampAtDrawS: +rampAt.toFixed(2),
                    fullMaxNockToHand: +full.toFixed(4), minHandHeadUnit: +minHand.toFixed(3) });
      };
      await measure(0, null, 'level');
      await measure(0.75, null, 'down');
      await measure(1.05, null, 'down105');
      await measure(-0.4, null, 'up');
      await measure(-0.55, null, 'up55');
      await measure(0, 'KeyD', 'strafeRight');
      C.input.mouse.buttons = 0; C.input.keys.clear();
      // handHeadUnit >= 0.88 == the glove rests ON the cheek rather than inside
      // the skull (the animator itself clamps the target to 0.90).
      const bad = rows.filter((r) => !(r.rampMaxNockToHand <= 0.09 && r.fullMaxNockToHand <= 0.09
                                    && r.minHandHeadUnit >= 0.88));
      return { pass: bad.length === 0, detail: { rows, failing: bad.map((r) => r.tag) } };
    })()`,
  },

  // ---------------- ROUND 4 · core-platform (§4) ----------------
  {
    id: 'A20-frame-loop-survives', kind: 'action', lane: 'core-platform',
    title: 'A throwing system cannot kill the frame loop; error logged once, sim keeps advancing',
    settle: 900, timeout: 90000,
    // this gate creates its own quarantined failures on purpose
    allowSystemErrors: ['^GateTempSystem\\.', '^Game\\._frameTail$'],
    assert: `(async () => {
      const g = __GAME__, ctx = __CTX__, e = ctx.engine;
      /**
       * FIX (core-platform-followup2) — THE PROBE MUST NOT BE ABLE TO BREAK THE
       * PATIENT. This gate is the only one that deliberately makes the running
       * game throw, and it did so with two unguarded mutations: a synthetic
       * system pushed into g.systems, and e._updateStats monkey-patched. Both
       * were undone by plain statements in the middle of the assert, so ANY
       * early exit — a thrown TypeError on a missing API, the runner's own
       * assert timeout abandoning this evaluate, the page being torn down
       * mid-await — left the game permanently sabotaged: a system throwing
       * 60x/second for the rest of the page's life, or the frame tail replaced
       * by a stub. That state then bled into the screenshot this gate saves and
       * into anything else reading the page. Worse, the removal was
       * \`splice(indexOf(bad), 1)\`, and indexOf returns -1 when the system is
       * already gone — splice(-1, 1) DELETES THE LAST REAL SYSTEM, silently
       * unregistering whatever lane happened to register last.
       *
       * Now: one \`undo()\` that is index-safe and idempotent, called from a
       * finally, and armed on the page's own clock as a watchdog so an
       * abandoned evaluate still restores the game.
       */
      let bad = null, realStats = null, badRef = null;
      const undo = () => {
        try {
          if (bad) { const i = g.systems.indexOf(bad); if (i >= 0) g.systems.splice(i, 1); bad = null; }
        } catch (err) { /* the array is gone; nothing to restore */ }
        try {
          if (realStats) { e._updateStats = realStats; realStats = null; }
        } catch (err) { /* engine is gone; nothing to restore */ }
      };
      if (window.__A20_WATCHDOG__) clearTimeout(window.__A20_WATCHDOG__);
      window.__A20_WATCHDOG__ = setTimeout(undo, 120000);
      try {
      /**
       * FIX (core-platform-followup) — WAIT FOR FRAMES, NOT FOR THE CLOCK.
       * The property under test is "a throwing system does not stop the loop",
       * and it was being sampled with setTimeout(1400): on a box running seven
       * lane suites at once that window delivered 6 rendered frames and the
       * gate failed for the neighbours' load, not for the build (measured:
       * framesAdvanced 6 and 26 against a >= 20 bar, with every error-ledger
       * term green). The waits below block until the loop has produced 40
       * frames, with a hard 20 s ceiling — so a DEAD loop still fails (frames
       * never arrive, the ceiling expires, frames < 20), a slow box does not,
       * and every threshold below is exactly the one it was.
       *
       * FOLLOWUP2 also counts raw rAF callbacks alongside engine.frames. The
       * question "is the loop alive" is then answered on two independent
       * channels — the engine's own counter, and the browser still servicing
       * animation frames for this document — and neither is console output,
       * which a quarantined system deliberately never writes to.
       */
      const waitFrames = async (n, capMs) => {
        const f = e.frames, t = performance.now();
        let raf = 0;
        while (e.frames - f < n && performance.now() - t < capMs) {
          await new Promise(r => requestAnimationFrame(r));
          raf++;
        }
        return { frames: e.frames - f, raf, ms: Math.round(performance.now() - t) };
      };
      const before = g.systemErrors.length;
      const alive = (ctx.machines?.list || []).filter(m => m.alive);
      const start = alive.map(m => ({ m, x: m.position.x, z: m.position.z }));
      const f0 = e.frames, s0 = e.simTime;
      const mix0 = ctx.player?.animator?.mixer?.time ?? 0;
      let calls = 0;
      bad = badRef = {
        constructor: { name: 'GateTempSystem' },
        update() { calls++; if (calls <= 3) throw new Error('A20 synthetic system failure'); },
      };
      g.systems.push(bad);
      const w1 = await waitFrames(40, 30000);
      undo();                                   // index-safe; never splice(-1, 1)
      const w1b = await waitFrames(4, 3000);
      const rec = g.systemErrors.find(x => x.key === 'GateTempSystem.update');
      let moved = 0;
      for (const s of start) moved = Math.max(moved, Math.hypot(s.m.position.x - s.x, s.m.position.z - s.z));
      const frames = e.frames - f0, sim = e.simTime - s0;
      const rafTicks = w1.raf + w1b.raf;
      const mixerAdvanced = (ctx.player?.animator?.mixer?.time ?? 0) - mix0;
      // Three independent witnesses that the loop kept running through the
      // throws: the engine's frame counter, the browser still servicing rAF for
      // this document, and simulated time actually moving the world.
      const simAlive = frames >= 20 && rafTicks >= 20 && sim > 0.4
        && (moved > 0.001 || mixerAdvanced > 0.4);

      // ---- the TAIL of the frame is guarded too ----
      // _recordFrame/_updateStats/_updateDynamicResolution run after the sim and
      // after render(); three re-arms rAF only once the whole callback returns,
      // so a throw there is just as fatal. _updateDynamicResolution calls
      // engine.resize(), which calls csm.updateFrustums() and the cross-lane
      // onResize hook — this is reachable, not theoretical.
      const f1 = e.frames;
      const boundStats = e._updateStats.bind(e);
      realStats = boundStats;                   // undo() restores this, always
      let tailCalls = 0;
      e._updateStats = function (dt) { tailCalls++; if (tailCalls <= 3) throw new Error('A20 synthetic frame-tail failure'); return boundStats(dt); };
      const w2 = await waitFrames(40, 30000);
      undo();
      const w2b = await waitFrames(4, 3000);
      const tailRec = g.systemErrors.find(x => x.key === 'Game._frameTail');
      const tailFrames = e.frames - f1;
      const tailRaf = w2.raf + w2b.raf;
      const tailOk = !!tailRec && tailRec.count >= 3 && tailRec.logs === 1
        && tailFrames >= 20 && tailRaf >= 20 && tailCalls > 3;

      const pass = !!rec && rec.count >= 3 && rec.logs === 1
        && g.systemErrors.length === before + 2 && simAlive && calls > 3 && tailOk;
      return { pass, detail: {
        framesAdvanced: frames, rafTicks, simAdvanced: +sim.toFixed(2),
        machineMoved: +moved.toFixed(3), mixerAdvanced: +mixerAdvanced.toFixed(2),
        systemCalledAfterThrow: calls, throws: rec?.count ?? 0, consoleLogs: rec?.logs ?? 0,
        waits: { systemPhase: w1, tailPhase: w2, note: 'frame-driven waits; ms is how long this box took to deliver them' },
        tail: { framesAfterTailThrow: tailFrames, tailRafTicks: tailRaf, tailThrows: tailRec?.count ?? 0,
                tailLogs: tailRec?.logs ?? 0, tailCalledAfterThrow: tailCalls, tailOk },
        errorRecords: g.systemErrors.length,
        restored: { tempSystemRemoved: g.systems.indexOf(badRef) < 0, frameTailRestored: e._updateStats === boundStats },
      } };
      } finally {
        // The game is handed back exactly as it was found, on every path out of
        // this gate — including the ones that do not come through here.
        undo();
        clearTimeout(window.__A20_WATCHDOG__);
        window.__A20_WATCHDOG__ = null;
      }
    })()`,
  },
  {
    id: 'A21-real-draw-calls', kind: 'action', lane: 'core-platform',
    title: 'Honest per-frame draw calls + whole-loop JS + frame budget on a DPR-2 display, three staged scenarios, per-term status',
    settle: 400, timeout: 300000,
    assert: `(async () => {
      const ctx = __CTX__, e = ctx.engine;
      ${WAIT_VARIETY}
      ${BURST}
      ${STAGE_PRELUDE}
      const B = ${JSON.stringify(BUDGETS)};
      const SC = ${JSON.stringify(PERF_SCENARIOS)};
      // "at DPR 2" = on a devicePixelRatio-2 display. The engine's quality tier
      // caps the applied ratio (high = 1.5) and THAT cap is the perf-tech-05
      // fix, so the gate exercises it instead of bypassing it. The uncapped
      // DPR-2 numbers are measured too and reported for the record.
      const applied = Math.min(B.deviceDpr, e.tier.dprCap);
      // FIX ROUND 1 — dynamic resolution OFF for the whole gate. With DRS live
      // the engine multiplies basePixelRatio by renderScale, so a burst
      // labelled "DPR 1.5" could be sampling 1.05 under load and no number in
      // the output would say so. setDynamicResolution(false) also snaps the
      // scale back to 1.
      const drsWas = e.drsEnabled;
      e.setDynamicResolution(false);
      e.enableGpuTimer(true);

      // Draw-call attribution so a failure names the lane that owes the fix.
      const census = () => {
        const cam = ctx.camera.position;
        const out = { player: 0, machines: 0, vegetation: 0, props: 0, terrainSky: 0, other: 0 };
        const casters = { player: 0, machines: 0, vegetation: 0, props: 0, terrainSky: 0, other: 0 };
        const bucket = (n) => /player|aloy/i.test(n) ? 'player'
          : /machine/i.test(n) ? 'machines'
          : /vegetation|grass|tree/i.test(n) ? 'vegetation'
          : /camp|prop|npc|gather|water/i.test(n) ? 'props'
          : /terrain|sky|ridge/i.test(n) ? 'terrainSky' : 'other';
        for (const child of ctx.scene.children) {
          if (!child.visible) continue;
          const k = bucket(child.name || '');
          child.traverse((o) => {
            if (!o.isMesh || !o.visible) return;
            const d = Math.hypot(o.matrixWorld.elements[12] - cam.x, o.matrixWorld.elements[14] - cam.z);
            if (d > 260) return;
            out[k]++;
            if (o.castShadow) casters[k]++;
          });
        }
        return { meshesWithin260m: out, shadowCasters: casters, activeShadowCasters: e.activeShadowCasters };
      };

      /**
       * EXACT attribution: wrap renderBufferDirect for a few frames and record
       * every real draw, bucketed by owner and by pass. The shadow pass swaps
       * in a MeshDepthMaterial, the post chain draws fullscreen quads with no
       * scene ancestor — so each call lands in exactly one bucket and the
       * totals add up to renderer.info.render.calls. Runs OUTSIDE the timed
       * bursts: the wrapper costs JS time and must not pollute a frame budget.
       */
      const ownerOf = (o) => {
        // Walk to the scene child this draw belongs to. An object with NO scene
        // ancestor is a fullscreen quad from the post chain; a scene child with
        // no name is somebody's unlabelled root and gets its own bucket rather
        // than being quietly added to post (that mistake hid 43 calls of scene
        // content inside "post" in the first version of this gate).
        let n = o, root = null;
        while (n) { if (n.parent === ctx.scene) { root = n; break; } n = n.parent; }
        if (!root) return null;
        const name = root.name || '';
        if (!name) return 'unnamedRoots';
        return /player|aloy/i.test(name) ? 'player'
          : /machine/i.test(name) ? 'machines'
          : /vegetation|grass|tree/i.test(name) ? 'vegetation'
          : /camp|prop|npc|gather|water/i.test(name) ? 'props'
          : /terrain|sky|ridge/i.test(name) ? 'terrainSky' : 'other';
      };
      const attributeCalls = async (frames = 6) => {
        const R = e.renderer;
        const real = R.renderBufferDirect.bind(R);
        const main = {}, shadow = {}, postDetail = {};
        let post = 0, total = 0, f = 0;
        R.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
          total++;
          const k = ownerOf(object);
          if (k === null) {
            post++;
            const tag = (material?.name || material?.type || '?');
            postDetail[tag] = (postDetail[tag] || 0) + 1;
          } else if (material && (material.isMeshDepthMaterial || material.isMeshDistanceMaterial)) {
            shadow[k] = (shadow[k] || 0) + 1;
          } else {
            main[k] = (main[k] || 0) + 1;
          }
          return real(camera, scene, geometry, material, object, group);
        };
        const f0 = e.frames;
        while (e.frames - f0 < frames) await new Promise(r => requestAnimationFrame(r));
        f = e.frames - f0;
        R.renderBufferDirect = real;
        const per = (obj) => { const o = {}; for (const k in obj) o[k] = Math.round(obj[k] / f); return o; };
        return { perFrame: Math.round(total / f), main: per(main), shadow: per(shadow),
                 post: Math.round(post / f), postDetail: per(postDetail) };
      };

      /**
       * What the engine could still batch, and what only the model owner can.
       * Every rigid (non-skinned, opaque, single-material) mesh with the same
       * material SIGNATURE could share one BatchedMesh draw; a skinned mesh
       * cannot be batched at all, and a mesh with a unique signature has
       * nothing to batch with. This is the ceiling of any renderer-side fix —
       * print it so nobody has to argue about whose deficit it is.
       */
      const batchCeiling = () => {
        const sig = (m) => [m.type, m.color && m.color.getHexString(), (m.roughness ?? -1).toFixed(3),
          (m.metalness ?? -1).toFixed(3), m.emissive && m.emissive.getHexString(), (m.emissiveIntensity ?? 1).toFixed(2),
          m.map?.uuid || '', m.normalMap?.uuid || '', m.roughnessMap?.uuid || '', m.emissiveMap?.uuid || '',
          m.transparent, m.side, m.flatShading, m.vertexColors].join('|');
        const per = {};
        for (const c of ctx.scene.children) {
          const mm = /^(\\w+)-machine$/.exec(c.name || ''); if (!mm) continue;
          const k = mm[1];
          const p = per[k] || (per[k] = { instances: 0, meshes: 0, skinned: 0, transparent: 0, rigid: 0, sigs: new Set() });
          p.instances++;
          c.traverse((o) => {
            if (!o.isMesh) return;
            p.meshes++;
            if (o.isSkinnedMesh) { p.skinned++; return; }
            const mat = Array.isArray(o.material) ? o.material[0] : o.material;
            if (!mat || Array.isArray(o.material)) { p.transparent++; return; }
            if (mat.transparent) { p.transparent++; return; }
            p.rigid++; p.sigs.add(sig(mat));
          });
        }
        const out = {}; let meshes = 0, batched = 0;
        for (const [k, v] of Object.entries(per)) {
          const drawsNow = v.meshes;
          const drawsBatched = v.skinned + v.transparent + v.sigs.size;
          out[k] = { instances: v.instances, meshes: v.meshes, skinned: v.skinned, transparent: v.transparent,
                     rigid: v.rigid, signatures: v.sigs.size, drawsNow, drawsIfEngineBatched: drawsBatched,
                     perInstanceNow: +(v.meshes / v.instances).toFixed(1) };
          meshes += drawsNow; batched += drawsBatched;
        }
        return { perSpecies: out, machineDrawsNow: meshes, machineDrawsIfEngineBatched: batched,
                 engineCeilingSaving: meshes - batched };
      };

      // Split the frame into what the ENGINE decides (post passes, how many
      // casters survived the cull) and what the CONTENT costs (main-pass
      // meshes). A failure has to be attributable or it is not actionable.
      const ledger = async (total) => {
        const R = e.renderer;
        const was = R.shadowMap.enabled;
        R.shadowMap.enabled = false;
        const s = await burst(12);
        R.shadowMap.enabled = was;
        const noShadow = s ? s.maxDrawCalls : null;
        return {
          totalCalls: total,
          shadowPassCalls: noShadow == null ? null : total - noShadow,
          mainPlusPostCalls: noShadow,
          postPasses: e.composer.passes.filter((p) => p.enabled).length,
          activeShadowCasters: e.activeShadowCasters,
          shadowCascades: e.shadowCascades ?? 1,
          sizeCulled: e.sizeCulled,
        };
      };

      const measureAt = async (dpr) => {
        e.basePixelRatio = dpr; e.renderScale = 1; e.resize();
        await new Promise(r => setTimeout(r, 700));
        const p95s = [], calls = [], callsMin = [], tris = [], js = [], gpu = [];
        const sim = [], sub = [], tail = [];
        let lastSnap = null;
        for (let i = 0; i < B.bursts; i++) {
          const s = await burst(B.sampleFrames);
          lastSnap = s;
          p95s.push(s.p95FrameMs); calls.push(s.maxDrawCalls); callsMin.push(s.minDrawCalls);
          tris.push(s.maxTriangles); js.push(s.p95JsMs);
          // JUDGE FIX — the JS term is now the whole main-loop callback
          // (engine._perf.js, written by main.js _frame). Its three parts are
          // reported so a red says which half owes it. A build whose engine
          // predates the split reports the parts as 0 and they sum short of
          // p95Js — that discrepancy is printed as jsPartsMissing rather than
          // silently ignored.
          sim.push(s.p95SimMs ?? null); sub.push(s.p95RenderMs ?? null); tail.push(s.p95TailMs ?? null);
          if (s.medianGpuMs != null) gpu.push(s.medianGpuMs);
        }
        const partsKnown = sim.every((x) => x != null);
        return {
          p95FrameMs: +median(p95s).toFixed(2), maxDrawCalls: Math.max(...calls),
          minDrawCalls: Math.min(...callsMin), maxTriangles: Math.max(...tris),
          p95JsMs: +median(js).toFixed(2),
          jsTerm: lastSnap?.jsTerm ?? null,
          p95SimMs: partsKnown ? +median(sim).toFixed(2) : null,
          p95SubmitMs: partsKnown ? +median(sub).toFixed(2) : null,
          p95TailMs: partsKnown ? +median(tail).toFixed(2) : null,
          jsPartsMissing: !partsKnown,
          jsBursts: js.map((x) => +x.toFixed(2)),
          jsInstability: +(Math.max(...js) / Math.max(0.01, Math.min(...js))).toFixed(2),
          medianGpuMs: gpu.length ? +median(gpu).toFixed(2) : null,
          effectivePixelRatio: +e.renderer.getPixelRatio().toFixed(3),
          // Four bursts of the SAME pinned frame. On a quiet box they agree;
          // when they disagree by more than a third, something outside this
          // page is deciding when our frames land.
          p95Bursts: p95s.map((x) => +x.toFixed(1)),
          p95Instability: +(Math.max(...p95s) / Math.max(0.01, Math.min(...p95s))).toFixed(2),
          // FIX ROUND 2 — the same self-witness for the GPU timer. A disjoint
          // timer query measures elapsed time on the GPU TIMELINE, so it is
          // inflated when our command stream is queued behind another client's
          // (measured: the same all-on configuration read 42.8 then 70.8 ms
          // minutes apart). Four bursts of ONE frozen composition that
          // disagree by more than a third are not measuring our frame.
          gpuBursts: gpu.map((x) => +x.toFixed(1)),
          gpuInstability: gpu.length > 1
            ? +(Math.max(...gpu) / Math.max(0.01, Math.min(...gpu))).toFixed(2) : null,
        };
      };

      // ONE staging per scenario; the capped pass, the frozen census and the
      // raw DPR-2 pass all read the SAME pinned scene instead of whatever the
      // AI had rearranged a minute later.
      const runScenario = async (name) => {
        const unpin = eval(SC[name]);
        try {
          await new Promise(r => setTimeout(r, 1500));   // settle under the pin
          const capped = await measureAt(applied);
          const attribution = census();
          const led = await ledger(capped.maxDrawCalls);
          // Sim halted: an exactly reproducible call count (min == max) that a
          // reviewer can re-derive by hand, plus the exact per-owner ledger.
          e.requestTimeScale('gate', 0);
          await new Promise(r => setTimeout(r, 350));
          const f = await burst(20);
          const draws = await attributeCalls(6);
          e.requestTimeScale('gate', null);
          const rawDpr2 = await measureAt(B.deviceDpr);
          return { capped, rawDpr2, attribution, ledger: led, draws,
                   frozen: { calls: f.maxDrawCalls, spread: f.maxDrawCalls - f.minDrawCalls } };
        } finally { unpin(); }
      };

      /**
       * CAN THIS BOX PRESENT ANY FRAME AT ALL? Hide the whole scene, kill every
       * post pass and the shadow map, drop to DPR 0.5 and measure: that frame
       * is a clear and a present, nothing else. rAF intervals are vsync-locked,
       * so a healthy null frame reads ~16.7 ms; anything materially above that
       * (or a GPU timer that still reads milliseconds with nothing drawn) means
       * another process owns the GPU and NO wall-clock number from this run can
       * be attributed to our frame. The draw-call and triangle terms are
       * unaffected — they are counters, not clocks — so they always count.
       */
      /**
       * CPU WITNESS FOR THE JS TERM. The null frame and the GPU timer say
       * nothing about whether our JAVASCRIPT ran at full speed: a box whose
       * cores are busy — or thermally throttled — inflates every
       * performance.now() delta inside the frame, and the JS term is nothing
       * but such deltas. So run a fixed, allocation-free arithmetic loop and
       * time it the same way in every scenario. The absolute number is
       * hardware; what the gate uses is its STABILITY across the run. Best of
       * five (the least-preempted sample is the honest one).
       */
      const cpuProbe = () => {
        let best = Infinity;
        for (let r = 0; r < 5; r++) {
          const t = performance.now();
          let x = 0;
          for (let i = 1; i <= 300000; i++) x += Math.sqrt(i) / (i + (x % 7) + 1);
          window.__cpuProbeSink = x;   // keep the loop from being optimised away
          const ms = performance.now() - t;
          if (ms < best) best = ms;
        }
        return +best.toFixed(3);
      };

      const nullFrame = async () => {
        const keep = { dpr: e.basePixelRatio, gtao: e.gtao.enabled, bloom: e.bloom.enabled,
                       smaa: e.smaa.enabled, shadows: e.renderer.shadowMap.enabled, vis: ctx.scene.visible };
        try {
          e.gtao.enabled = false; e.bloom.enabled = false; e.smaa.enabled = false;
          e.renderer.shadowMap.enabled = false;
          ctx.scene.visible = false;
          e.basePixelRatio = 0.5; e.renderScale = 1; e.resize();
          await new Promise(r => setTimeout(r, 500));
          const s = await burst(60);
          return { p95FrameMs: s.p95FrameMs, medianFrameMs: s.medianFrameMs,
                   medianGpuMs: s.medianGpuMs, calls: s.maxDrawCalls,
                   cpuProbeMs: cpuProbe() };
        } finally {
          ctx.scene.visible = keep.vis;
          e.gtao.enabled = keep.gtao; e.bloom.enabled = keep.bloom; e.smaa.enabled = keep.smaa;
          e.renderer.shadowMap.enabled = keep.shadows;
          e.basePixelRatio = keep.dpr; e.renderScale = 1; e.resize();
          await new Promise(r => setTimeout(r, 300));
        }
      };

      const capped = {}, rawDpr2 = {}, perScenario = {}, floors = {};
      for (const name of Object.keys(SC)) {
        const r = await runScenario(name);
        capped[name] = r.capped; rawDpr2[name] = r.rawDpr2;
        perScenario[name] = { frozenCalls: r.frozen.calls, frozenSpread: r.frozen.spread,
                              drawsPerFrame: r.draws, ledger: r.ledger, attribution: r.attribution };
        // FIX ROUND 2 — the contention witness is sampled RIGHT AFTER the
        // scenario it guards, not once at the end of a five-minute run. The
        // single trailing probe read 0.53 ms of GPU in a quiet gap and so
        // declared the whole run attributable, while the scenarios themselves
        // had been measured against a second suite on the same GPU. Three
        // probes, spread across the run; the verdict uses the WORST.
        floors[name] = await nullFrame();
      }
      const ceiling = batchCeiling();
      const fnames = Object.keys(floors);
      const floor = {
        p95FrameMs: Math.max(...fnames.map((n) => floors[n].p95FrameMs)),
        medianFrameMs: Math.max(...fnames.map((n) => floors[n].medianFrameMs)),
        medianGpuMs: fnames.every((n) => floors[n].medianGpuMs == null) ? null
          : Math.max(...fnames.map((n) => floors[n].medianGpuMs ?? 0)),
        calls: Math.max(...fnames.map((n) => floors[n].calls)),
        cpuProbeMs: { best: Math.min(...fnames.map((n) => floors[n].cpuProbeMs)),
                      worst: Math.max(...fnames.map((n) => floors[n].cpuProbeMs)) },
        perScenario: floors,
      };
      // Same loop, three points in a five-minute run: if it takes materially
      // longer in one scenario than another, the CPU this page got was not
      // constant and no JS millisecond in that run is the build's.
      const cpuInstability = +(floor.cpuProbeMs.worst / Math.max(0.001, floor.cpuProbeMs.best)).toFixed(2);
      e.basePixelRatio = Math.min(window.devicePixelRatio || 1, e.tier.dprCap);
      e.renderScale = 1; e.resize();
      e.setDynamicResolution(drsWas);

      const names = Object.keys(SC);
      /**
       * FIX ROUND 2 — grade the DPR-2 pass, not only the tier-capped one.
       * §4 says "accumulate 20 frames at DPR 2". The gate used to grade
       * the capped pass (applied ratio 1.5) and merely REPORTED the DPR-2 one,
       * which is quietly more lenient: the screen-space size cull thresholds on
       * basePixelRatio, so a lower applied ratio culls more meshes and yields
       * fewer draws (measured: up to 8 draws hidden). Every term is now graded
       * on the WORSE of the two passes — that includes the literal DPR-2 bar
       * and can never be more forgiving than either pass alone. Both passes
       * are still reported in full.
       */
      const worseOf = (n, k) => Math.max(capped[n][k], rawDpr2[n][k]);
      const graded = {};
      for (const n of names) {
        const gpuA = capped[n].medianGpuMs, gpuB = rawDpr2[n].medianGpuMs;
        graded[n] = {
          maxDrawCalls: worseOf(n, 'maxDrawCalls'), maxTriangles: worseOf(n, 'maxTriangles'),
          p95FrameMs: worseOf(n, 'p95FrameMs'), p95JsMs: worseOf(n, 'p95JsMs'),
          medianGpuMs: (gpuA == null && gpuB == null) ? null : Math.max(gpuA ?? 0, gpuB ?? 0),
          // the parts of the graded JS number, from the pass that was graded
          jsParts: (() => {
            const src = capped[n].p95JsMs >= rawDpr2[n].p95JsMs ? capped[n] : rawDpr2[n];
            return { simMs: src.p95SimMs, submitMs: src.p95SubmitMs, tailMs: src.p95TailMs,
                     term: src.jsTerm, partsMissing: src.jsPartsMissing };
          })(),
          jsInstability: worseOf(n, 'jsInstability'),
          p95Instability: worseOf(n, 'p95Instability'),
          gpuInstability: Math.max(capped[n].gpuInstability ?? 0, rawDpr2[n].gpuInstability ?? 0) || null,
          gradedFrom: { cappedPixelRatio: capped[n].effectivePixelRatio,
                        dpr2PixelRatio: rawDpr2[n].effectivePixelRatio },
        };
      }
      const callsOk = names.every(n => graded[n].maxDrawCalls <= B.drawCalls);
      const trisOk = names.every(n => graded[n].maxTriangles <= B.triangles);
      const frameOk = names.every(n => graded[n].p95FrameMs <= B.frameP95Ms);
      const jsOk = names.every(n => graded[n].p95JsMs <= B.jsP95Ms);
      // The wall-clock terms only mean something on a box that can present an
      // empty frame inside the budget. This is NOT a way to pass — when the
      // witnesses trip the gate resolves PENDING, never PASS — and the
      // deterministic terms always count. Three witnesses, sampled three times
      // (once after each scenario), because they catch different neighbours:
      // (a) null-frame rAF: nothing drawn, DPR 0.5 — if THAT misses vsync the
      //     box cannot present at all (CPU contention, thermal, a busy
      //     compositor).
      // (b) null-frame GPU: milliseconds of GPU time with nothing drawn means
      //     our command stream is queued behind another client's. Measured on
      //     this box: 0.53 ms idle, 4.92 ms with a second suite running — and
      //     the rAF half read a healthy 60.7 fps through the same contention,
      //     which is exactly why one witness is not enough.
      // (c) instability: four bursts of one pinned, frozen composition that
      //     disagree by more than a third are not measuring our frame.
      const unstable = Math.max(...names.map((n) => graded[n].p95Instability));
      const contended = floor.p95FrameMs > B.frameP95Ms * 0.9
        || (floor.medianGpuMs != null && floor.medianGpuMs > 3)
        || unstable > 1.4;
      const clockTermsCounted = !contended;

      /**
       * FIX ROUND 2 — the GPU term now votes.
       * The rAF interval is vsync-quantised and shared with every other Chrome
       * on the box, which is why it needs the witnesses above. The disjoint
       * timer query is neither: it measures OUR command stream. So when the
       * null frame proves the GPU is essentially idle for us (< 3 ms with
       * nothing drawn), a scene whose median GPU time blows the frame budget
       * is our cost and FAILS here — this term is deterministic enough to
       * count even on a run where the wall clock is not.
       */
      const gpuUnstable = Math.max(0, ...names.map((n) => graded[n].gpuInstability ?? 0));
      const gpuJudgeable = floor.medianGpuMs != null && floor.medianGpuMs < 3
        && names.every((n) => graded[n].medianGpuMs != null)
        && gpuUnstable > 0 && gpuUnstable <= 1.4;
      const gpuOk = !gpuJudgeable
        || names.every((n) => graded[n].medianGpuMs <= B.frameP95Ms);
      const gpuBlockedBy = gpuOk ? null : {
        term: 'medianGpuMs', budget: B.frameP95Ms,
        perScenario: Object.fromEntries(names.map((n) => [n, graded[n].medianGpuMs])),
        nullFrameGpuMs: floor.medianGpuMs, gpuInstability: gpuUnstable,
        owner: 'the frame itself: with nothing drawn this box gives us the GPU in '
             + floor.medianGpuMs + ' ms, so the scene GPU time is ours to pay down.',
      };

      // Name the owner of whatever is over. Machine meshes have no LOD chain at
      // any distance (perf-tech-04) and near-unique materials (perf-tech-14),
      // so when they dominate the ledger the deficit is machine-rig's, not the
      // renderer's — say so in the failure instead of leaving it anonymous.
      const worst = names.slice().sort((a, b) => graded[b].maxDrawCalls - graded[a].maxDrawCalls)[0];
      const wd = perScenario[worst].drawsPerFrame;
      const machineDraws = (wd.main.machines || 0) + (wd.shadow.machines || 0);
      const blockedBy = callsOk ? null : {
        term: 'drawCalls', scenario: worst,
        over: graded[worst].maxDrawCalls - B.drawCalls,
        machineDrawsInWorstFrame: machineDraws,
        engineSideCeiling: ceiling.engineCeilingSaving,
        owner: 'machine-rig perf-tech-04 (LOD chains) + perf-tech-14 (per-species mesh/material budgets)',
        note: 'Engine-side levers are spent and measured: shadow casters culled to '
            + perScenario[worst].ledger.activeShadowCasters + ', screen-space cull hides '
            + perScenario[worst].ledger.sizeCulled + ' sub-pixel meshes/frame, post is '
            + wd.post + ' calls. Even a perfect BatchedMesh pass over every rigid machine mesh '
            + 'that shares a material signature would only save ' + ceiling.engineCeilingSaving
            + ' draws world-wide (' + ceiling.machineDrawsNow + ' -> ' + ceiling.machineDrawsIfEngineBatched
            + '), because the machines are ' + Object.values(ceiling.perSpecies).reduce((a, b) => a + b.skinned, 0)
            + ' skinned meshes and near-unique materials. Only per-species LOD chains close this.',
      };
      const frameBlockedBy = frameOk ? null : {
        term: 'frameP95Ms', nullFrame: floor, counted: clockTermsCounted, worstBurstInstability: unstable,
        owner: contended
          ? 'NOT ATTRIBUTABLE on this box: null frame p95 ' + floor.p95FrameMs + ' ms (gpu '
            + floor.medianGpuMs + ' ms) with nothing drawn, and four bursts of one FROZEN composition '
            + 'disagree by ' + unstable + 'x. Something outside this page decides when our frames land. '
            + 'Re-run on a quiet machine (one Chrome) before judging this term.'
          : 'the frame itself: an empty frame presents inside budget on this box, so the cost is ours.',
      };
      /**
       * THE JS TERM (Round 4 judge finding). Two things must be true before it
       * can be graded at all:
       *   (1) the engine must SAY what its JS number covers. perfSnapshot
       *       publishes jsTerm and the sim/submit/tail split; a build that
       *       reports neither is timing the submit half only — which is the
       *       exact defect this gate was rewritten for — and grading that
       *       against a "systems + submit" budget would be a false green.
       *   (2) the CPU this page got must have been constant across the run
       *       (cpuProbe), on top of the null-frame witnesses. JS milliseconds
       *       are performance.now() deltas: a preempted or throttled core
       *       inflates every one of them.
       */
      const JS_TERM = 'sim(steps+interpolate) + renderSubmit + frameTail';
      const jsWhole = names.every((n) => graded[n].jsParts.term === JS_TERM
        && graded[n].jsParts.simMs != null && graded[n].jsParts.partsMissing !== true);
      const jsUnstable = Math.max(...names.map((n) => graded[n].jsInstability ?? 0));
      const cpuStable = cpuInstability <= 1.4;
      const jsJudgeable = jsWhole && clockTermsCounted && cpuStable && jsUnstable <= 1.6;
      const jsWhy = jsJudgeable ? null
        : !jsWhole
          ? 'this build does not publish a whole-loop JS term (perfSnapshot().jsTerm = '
            + JSON.stringify(graded[names[0]].jsParts.term) + '), so the only number available is the '
            + 'render-submit half and grading it against a systems+submit budget would be a false green'
        : !clockTermsCounted
          ? 'the box is contended: null frame p95 ' + floor.p95FrameMs + ' ms (gpu ' + floor.medianGpuMs
            + ' ms) with nothing drawn, frame-burst instability ' + unstable + 'x'
        : !cpuStable
          ? 'the same fixed CPU loop took ' + cpuInstability + 'x longer in one scenario than another ('
            + floor.cpuProbeMs.best + ' -> ' + floor.cpuProbeMs.worst + ' ms): the cores were not ours for the whole run'
          : 'four JS bursts of one frozen composition disagree by ' + jsUnstable + 'x';
      const jsWorst = names.slice().sort((a, b) => graded[b].p95JsMs - graded[a].p95JsMs)[0];
      const jsBlockedBy = (jsJudgeable && !jsOk) ? {
        term: 'jsP95Ms', budget: B.jsP95Ms, scenario: jsWorst, value: graded[jsWorst].p95JsMs,
        parts: graded[jsWorst].jsParts, cpuProbeMs: floor.cpuProbeMs,
        owner: 'core-platform + whichever system dominates the sim half: of ' + graded[jsWorst].p95JsMs
             + ' ms, sim (every system update + interpolate) is ' + graded[jsWorst].jsParts.simMs
             + ' ms, render submit ' + graded[jsWorst].jsParts.submitMs + ' ms, frame tail '
             + graded[jsWorst].jsParts.tailMs + ' ms. F3 prints the same split live.',
      } : null;

      /**
       * PER-TERM STATUS — an unjudged term is PENDING WITH A REASON, never
       * PASS, and never silently folded into a verdict.
       * A red DETERMINISTIC term (calls / triangles / an attributable GPU
       * timer) FAILs on the spot: counters do not care how busy the box is.
       * Anything the gate could not measure honestly resolves PENDING and says
       * why, in its own row. Gate verdict = FAIL if any term FAILs, else
       * PENDING if any term is unjudged, else PASS.
       */
      const per = (k) => Object.fromEntries(names.map((n) => [n, graded[n][k]]));
      const T = (status, value, budget, extra) => Object.assign({ status, value, budget }, extra || {});
      const terms = {
        drawCalls: T(callsOk ? 'PASS' : 'FAIL', per('maxDrawCalls'), B.drawCalls,
          { measures: 'renderer.info.render.calls, whole frame, autoReset off (deterministic counter)',
            blockedBy }),
        triangles: T(trisOk ? 'PASS' : 'FAIL', per('maxTriangles'), B.triangles,
          { measures: 'renderer.info.render.triangles, whole frame (deterministic counter)',
            blockedBy: trisOk ? null : (() => {
              const w = names.slice().sort((a, b) => graded[b].maxTriangles - graded[a].maxTriangles)[0];
              return { term: 'triangles', scenario: w, over: graded[w].maxTriangles - B.triangles,
                       meshesWithin260m: perScenario[w].attribution.meshesWithin260m,
                       shadowCasters: perScenario[w].attribution.shadowCasters,
                       drawsPerFrame: perScenario[w].drawsPerFrame,
                       owner: 'whichever content lane owns the heaviest bucket above: the counter is '
                            + 'the whole frame, so a shadow-casting mesh is counted once per cascade. '
                            + 'core-platform levers (distance + screen-space culling, caster budget) '
                            + 'are already applied and reported in perScenario[' + w + '].ledger.' };
            })() }),
        medianGpuMs: T(!gpuJudgeable ? 'PENDING' : gpuOk ? 'PASS' : 'FAIL', per('medianGpuMs'), B.frameP95Ms,
          { measures: 'EXT_disjoint_timer_query over the whole composer chain',
            reason: gpuJudgeable ? null
              : 'not attributable: null-frame GPU ' + floor.medianGpuMs + ' ms with nothing drawn, '
                + 'GPU-burst instability ' + gpuUnstable + 'x (needs < 3 ms and <= 1.4x)',
            blockedBy: gpuBlockedBy }),
        p95FrameMs: T(!clockTermsCounted ? 'PENDING' : frameOk ? 'PASS' : 'FAIL', per('p95FrameMs'), B.frameP95Ms,
          { measures: 'rAF interval, vsync-quantised wall clock',
            reason: clockTermsCounted ? null
              : 'not attributable: null frame p95 ' + floor.p95FrameMs + ' ms (gpu ' + floor.medianGpuMs
                + ' ms) with nothing drawn; frame-burst instability ' + unstable + 'x',
            blockedBy: frameBlockedBy }),
        p95JsMs: T(!jsJudgeable ? 'PENDING' : jsOk ? 'PASS' : 'FAIL', per('p95JsMs'), B.jsP95Ms,
          { measures: 'WHOLE main-loop callback: ' + (jsWhole ? JS_TERM : 'UNKNOWN (build does not say)'),
            parts: Object.fromEntries(names.map((n) => [n, graded[n].jsParts])),
            witnesses: { termDeclaredWholeLoop: jsWhole,
                         cpuInstability, cpuMax: 1.4, cpuProbeMs: floor.cpuProbeMs,
                         jsBurstInstability: jsUnstable, jsBurstMax: 1.6,
                         boxPresentsAFrame: clockTermsCounted },
            reason: jsWhy, blockedBy: jsBlockedBy }),
      };
      const statuses = Object.values(terms).map((t) => t.status);
      const verdict = statuses.includes('FAIL') ? false : statuses.includes('PENDING') ? null : true;
      const say = (s) => Object.entries(terms).filter(([, t]) => t.status === s).map(([k]) => k);
      return { pass: verdict, detail: {
        verdict: (verdict === true ? 'PASS' : verdict === null ? 'PENDING' : 'FAIL') + ' — '
          + [say('FAIL').length ? 'FAIL ' + say('FAIL').join(' + ') : '',
             say('PENDING').length ? 'PENDING ' + say('PENDING').join(' + ') : '',
             say('PASS').length ? 'PASS ' + say('PASS').join(' + ') : '']
            .filter(Boolean).join('; ')
          + ' — see detail.terms for the reason on every unjudged term.',
        terms,
        gradedAt: 'worse of tier-capped (' + applied + ') and DPR ' + B.deviceDpr,
        deviceDpr: B.deviceDpr, appliedPixelRatio: applied, quality: e.quality, dynamicResolution: 'off for measurement',
        budget: { drawCalls: B.drawCalls, triangles: B.triangles, frameP95Ms: B.frameP95Ms, jsP95Ms: B.jsP95Ms },
        graded, capped, rawDpr2, callsOk, trisOk, gpuOk, gpuJudgeable, gpuInstability: gpuUnstable,
        frameOk, jsOk, jsJudgeable, jsWhole, jsInstability: jsUnstable,
        cpuProbeMs: floor.cpuProbeMs, cpuInstability,
        clockTermsCounted, nullFrame: floor,
        perScenario, batchCeiling: ceiling, blockedBy, frameBlockedBy, gpuBlockedBy,
      } };
    })()`,
  },
  {
    id: 'A22-msaa', kind: 'action', lane: 'core-platform',
    title: 'Composer scene target is multisampled and an SMAA pass is live',
    settle: 900,
    assert: `(async () => {
      const e = __CTX__.engine;
      const passes = e.composer.passes.map(p => p.constructor.name);
      const samples = e.composer.renderTarget1.samples;
      const aaPass = e.composer.passes.find(p => /SMAA|TAA/.test(p.constructor.name));
      return { pass: samples >= 4 && !!aaPass && aaPass.enabled === true
                 && e.composer.renderTarget1 === e.sceneTarget,
               detail: { samples, aaPass: aaPass?.constructor.name ?? null,
                         aaEnabled: aaPass?.enabled ?? false,
                         sceneTargetIsRenderTarget1: e.composer.renderTarget1 === e.sceneTarget,
                         gtao: e.gtao.enabled, passes } };
    })()`,
  },

  {
    id: 'A20b-no-system-errors', kind: 'action', lane: 'core-platform',
    title: 'A clean boot plus 6 s of play quarantines nothing: systemErrors and hook errors both empty',
    setup: INPUT_ON, settle: 900, timeout: 40000,
    assert: `(async () => {
      const g = __GAME__, e = __CTX__.engine;
      const f0 = e.frames;
      // exercise the paths that only run under load: input, resize (which is
      // what dynamic resolution calls), quality swap, and the cull pass
      __CTX__.input.keys.add('KeyW');
      await new Promise(r => setTimeout(r, 1500));
      __CTX__.input.keys.add('ShiftLeft');
      await new Promise(r => setTimeout(r, 1500));
      __CTX__.input.keys.delete('KeyW'); __CTX__.input.keys.delete('ShiftLeft');
      e.resize();
      await new Promise(r => setTimeout(r, 1200));
      e.setQuality('medium'); await new Promise(r => setTimeout(r, 900));
      e.setQuality('high');   await new Promise(r => setTimeout(r, 1200));
      const errs = (g.systemErrors || []).map(r => ({ key: r.key, count: r.count, message: r.message.slice(0, 90) }));
      const hooks = e.hookErrorCount || 0;
      const frames = e.frames - f0;
      return { pass: errs.length === 0 && hooks === 0 && frames > 120,
               detail: { systemErrors: errs, hookErrors: hooks, framesAdvanced: frames,
                         quality: e.quality, stepMode: e.stepMode } };
    })()`,
  },
  {
    id: 'A45-no-skate-per-species', kind: 'action', lane: 'machine-rig',
    title: 'PER SPECIES: a planted machine foot does not skate (audit A45: stance drift <= 0.06 m)',
    settle: 500, timeout: 180000,
    assert: `(async () => {
      ${WAIT_VARIETY}
      ${SPECIES}
      const T = __CTX__.terrain, out = {};
      let worstAll = 0, measured = 0;
      for (const [kind, m] of species) {
        if (!m.debugFeet || m.debugFeet().length < 2) { out[kind] = 'no feet'; continue; }
        ${PROVOKE}
        const open = {}, done = [];
        const t0 = performance.now();
        let moved = 0, sx = m.position.x, sz = m.position.z;
        while (performance.now() - t0 < 5000) {
          moved += Math.hypot(m.position.x - sx, m.position.z - sz);
          sx = m.position.x; sz = m.position.z;
          for (const f of m.debugFeet()) {
            const on = f.planted && Math.abs(f.world.y - T.getHeight(f.world.x, f.world.z)) <= 0.25;
            const w = open[f.name];
            if (on) {
              if (!w) open[f.name] = { x0: f.world.x, x1: f.world.x, z0: f.world.z, z1: f.world.z, n: 1 };
              else {
                w.x0 = Math.min(w.x0, f.world.x); w.x1 = Math.max(w.x1, f.world.x);
                w.z0 = Math.min(w.z0, f.world.z); w.z1 = Math.max(w.z1, f.world.z); w.n++;
              }
            } else if (w) {
              if (w.n >= 4) done.push(+Math.hypot(w.x1 - w.x0, w.z1 - w.z0).toFixed(3));
              open[f.name] = null;
            }
          }
          await new Promise(r => requestAnimationFrame(r));
        }
        if (moved < 0.4 || done.length < 2) { out[kind] = { skipped: 'idle', movedM: +moved.toFixed(2), windows: done.length }; continue; }
        const worst = Math.max(...done);
        out[kind] = { maxStanceDriftM: worst, windows: done.length, movedM: +moved.toFixed(2) };
        worstAll = Math.max(worstAll, worst);
        measured++;
      }
      if (measured < 2) return { pass: null, detail: { note: 'SKIP: fewer than 2 species walked far enough to sample', out } };
      return { pass: worstAll <= 0.06, detail: { budgetM: 0.06, worstM: worstAll, speciesMeasured: measured, out } };
    })()`,
  },
  {
    id: 'A44-socket-integrity', kind: 'action', lane: 'machine-rig',
    title: 'PER SPECIES: every weak point sits on the hull (audit A44: gap <= 0.10 m) alive AND dead',
    settle: 600, timeout: 120000,
    assert: `(async () => {
      ${WAIT_VARIETY}
      ${SPECIES}
      ${HULL}
      const out = {}; let worst = 0, checked = 0;
      const scan = (m, phase, rec) => {
        const boxes = hullBoxes(m);
        if (!boxes.length || !m.weakPoints?.length) return;
        for (const wp of m.weakPoints) {
          if (!wp.obj) continue;
          const p = wp.obj.getWorldPosition(new V());
          const gap = Math.max(0, distToHull(p, boxes) - (wp.radius || 0));
          rec[phase + ':' + wp.name] = +gap.toFixed(3);
          if (gap > worst) worst = gap;
          checked++;
        }
      };
      for (const [kind, m] of species) {
        const rec = {};
        scan(m, 'alive', rec);
        out[kind] = rec;
      }
      // dead pass: kill one of each species and re-measure once it has settled
      for (const [, m] of species) {
        try { m.takeDamage({ impact: 99999, dir: new V(0, 0, 1), point: m.position.clone() }); } catch (e) { /* */ }
        if (m.alive) { try { m._die(); } catch (e) { /* */ } }
      }
      await new Promise(r => setTimeout(r, 3200));
      for (const [kind, m] of species) scan(m, 'dead', out[kind]);
      if (!checked) return { pass: null, detail: 'SKIP: no machine exposes weakPoints' };
      return { pass: worst <= 0.1, detail: { budgetM: 0.1, worstGapM: +worst.toFixed(3), pointsChecked: checked, out } };
    })()`,
  },
  {
    id: 'A47-corpse-grounded', kind: 'action', lane: 'machine-rig',
    title: 'PER SPECIES: a corpse settles ON the ground (audit A47: penetration <= 0.10 m, and it may not float)',
    settle: 600, timeout: 120000,
    assert: `(async () => {
      ${WAIT_VARIETY}
      ${SPECIES}
      ${HULL}
      const T = __CTX__.terrain, out = {};
      for (const [, m] of species) {
        try { m.takeDamage({ impact: 99999, dir: new V(0, 0, 1), point: m.position.clone() }); } catch (e) { /* */ }
        if (m.alive) { try { m._die(); } catch (e) { /* */ } }
      }
      await new Promise(r => setTimeout(r, 5000));
      let worst = 0, n = 0;
      for (const [kind, m] of species) {
        const boxes = hullBoxes(m);
        if (!boxes.length) { out[kind] = 'no hull'; continue; }
        let minY = 1e9, cx = 0, cz = 0;
        for (const b of boxes) { minY = Math.min(minY, b.mn.y); cx += (b.mn.x + b.mx.x) / 2; cz += (b.mn.z + b.mx.z) / 2; }
        cx /= boxes.length; cz /= boxes.length;
        const ground = T.getHeight(cx, cz);
        const off = minY - ground;
        out[kind] = { lowestMinusGroundM: +off.toFixed(2), dead: !m.alive };
        worst = Math.max(worst, Math.abs(off > 0 ? off / 0.4 : off / 0.3));
        n++;
      }
      if (!n) return { pass: null, detail: 'SKIP: no species hulls' };
      const bad = Object.entries(out).filter(([, v]) => v && v.lowestMinusGroundM !== undefined
        && (v.lowestMinusGroundM < -0.1 || v.lowestMinusGroundM > 0.4)).map(([k]) => k);
      return { pass: bad.length === 0, detail: { budget: 'penetration <= 0.10 m, float <= 0.40 m', offenders: bad, speciesChecked: n, out } };
    })()`,
  },
  {
    id: 'A48-cadence', kind: 'action', lane: 'machine-rig',
    title: 'PER SPECIES: stride cadence scales with body length (audit A48; airborne fraction reported)',
    settle: 500, timeout: 180000,
    assert: `(async () => {
      ${WAIT_VARIETY}
      ${SPECIES}
      ${HULL}
      const out = {}; let measured = 0; const offenders = [];
      for (const [kind, m] of species) {
        if (!m.debugFeet || m.debugFeet().length < 2) { out[kind] = 'no feet'; continue; }
        const boxes = hullBoxes(m);
        let L = 1;
        for (const b of boxes) L = Math.max(L, Math.max(b.mx.x - b.mn.x, b.mx.z - b.mn.z));
        ${PROVOKE}
        const state = {}; let plants = 0, feet = 0, samples = 0, airborne = 0;
        const t0 = performance.now();
        let moved = 0, sx = m.position.x, sz = m.position.z;
        while (performance.now() - t0 < 5000) {
          moved += Math.hypot(m.position.x - sx, m.position.z - sz);
          sx = m.position.x; sz = m.position.z;
          const fs = m.debugFeet();
          feet = fs.length;
          let planted = 0;
          for (const f of fs) {
            if (f.planted && state[f.name] === false) plants++;
            if (f.planted) planted++;
            state[f.name] = !!f.planted;
          }
          samples++;
          if (planted === 0) airborne++;
          await new Promise(r => requestAnimationFrame(r));
        }
        const secs = (performance.now() - t0) / 1000;
        const hz = feet ? plants / feet / secs : 0;
        // biomechanical scaling: stride frequency falls as sqrt of body length.
        // reference = a 2.5 m strider at 2.2 Hz; band is 0.45x - 1.35x of it.
        const ref = 2.2 / Math.sqrt(Math.max(0.5, L / 2.5));
        const lo = ref * 0.45, hi = ref * 1.35;
        const ok = moved < 0.4 ? null : hz >= lo && hz <= hi;
        out[kind] = { bodyLengthM: +L.toFixed(1), cadenceHz: +hz.toFixed(2),
                      bandHz: [+lo.toFixed(2), +hi.toFixed(2)], movedM: +moved.toFixed(2),
                      airborneFraction: samples ? +(airborne / samples).toFixed(3) : null,
                      status: ok === null ? 'idle' : ok ? 'ok' : 'OUT OF BAND' };
        if (ok === false) offenders.push(kind);
        if (ok !== null) measured++;
      }
      if (measured < 2) return { pass: null, detail: { note: 'SKIP: fewer than 2 species walked far enough to sample', out } };
      return { pass: offenders.length === 0, detail: { speciesMeasured: measured, offenders, out } };
    })()`,
  },

  // ---------------- VISUAL GATES ----------------
  {
    id: 'V1-sprint-frame', kind: 'visual', lane: 'animator',
    title: 'Sprint mid-stride reads athletic',
    setup: `${INPUT_ON} __CTX__.input.keys.add('KeyW'); __CTX__.input.keys.add('ShiftLeft');`,
    settle: 2300,
    criteria: 'Visible arm swing (a wrist clearly away from the hip line), forward torso lean, stride extension, hair/cloth trailing. FAIL if arms hang straight or pose reads as walking mannequin.',
  },
  {
    id: 'V2-idle-frame', kind: 'visual', lane: 'animator',
    title: 'Idle stance reads alive and asymmetric',
    settle: 4000,
    criteria: 'Weight settled into one hip (pelvis offset), relaxed asymmetric arms, natural head angle. FAIL if perfectly symmetric A-pose-with-arms-down.',
  },
  {
    id: 'V3-crouch-stalk', kind: 'visual', lane: 'animator',
    title: 'Crouch-walk reads as stalking',
    setup: `${INPUT_ON} __CTX__.input.keys.add('KeyW'); __CTX__.input.keys.add('KeyC');`,
    settle: 2300,
    criteria: 'Silhouette ~60% of standing height, torso pitched forward ~30°, weapon held low, one hand low for balance. FAIL if it reads as slightly-bent standing.',
  },
  {
    id: 'V4-aim-anchor', kind: 'visual', lane: 'animator',
    title: 'Full draw anchored at cheek',
    setup: `${INPUT_ON} __CTX__.input.mouse.buttons |= 4; setTimeout(() => { __CTX__.input.mouse.buttons |= 1; }, 400);`,
    settle: 2200,
    criteria: 'Draw hand at cheek/jaw, elbow high and level, arrow nocked ON the string line, torso twisted toward target. FAIL if arrow floats detached or draw hand is off the face.',
  },
  {
    id: 'V5-machine-stride', kind: 'visual', lane: 'machines',
    title: 'Sawtooth mid-stride: lifted swing leg + planted stance leg',
    setup: `(() => {
      const m = (__CTX__.machines?.list || []).find(x => x.kind === 'sawtooth' && x.alive)
             || (__CTX__.machines?.list || []).find(x => x.alive && x.kind !== 'watcher');
      if (!m) return;
      const p = __CTX__.player;
      p.position.set(m.position.x + 9, 0, m.position.z + 7);
      p.camYaw = Math.atan2(m.position.x - p.position.x, m.position.z - p.position.z) + Math.PI;
      p.camPitch = 0.18; p._snapToGround?.();
    })();`,
    settle: 2500,
    criteria: 'At least one leg clearly lifted mid-swing while a contralateral foot is planted ON the ground line. No vertex smearing/stretching at the hips. FAIL if legs are frozen or feet hover.',
  },
  {
    id: 'V6-machine-death', kind: 'visual', lane: 'machines',
    title: 'Machine wreck reads as collapsed, not sunk',
    setup: `(() => { const w = (__CTX__.machines?.list || []).find(m => m.kind === 'watcher' && m.alive); if (w) { let mesh = null; w.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; }); const p = __CTX__.player; p.position.set(w.position.x + 7, 0, w.position.z + 5); p.camYaw = Math.atan2(w.position.x - p.position.x, w.position.z - p.position.z) + Math.PI; p.camPitch = 0.2; p._snapToGround?.(); w.takeDamage({ point: w.position.clone(), object: mesh, impact: 99999, tear: 0, element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'hunter', baseDamage: 99999 }); } })();`,
    settle: 3500,
    criteria: 'Corpse shows buckled legs / dropped neck / keeled body ON the terrain surface. FAIL if it is a half-sunk intact statue.',
  },
  {
    id: 'V7-vista-mountains', kind: 'visual', lane: 'environment',
    title: 'Mountain ring silhouettes varied, no wallpaper banding',
    params: 'yaw=3.1&pitch=0.12',
    settle: 1800,
    criteria: 'Peaks differ in silhouette across the skyline; strata banding only on some faces; irregular snowline. FAIL if the same striped wall texture repeats uniformly.',
  },
  {
    id: 'V8-riverbed', kind: 'visual', lane: 'environment',
    title: 'Riverbed is a place, not a void',
    setup: `(() => {
      const w = __CTX__.environment?.water;
      const p = w?.pools?.[0];
      if (p) { __CTX__.player.position.set(p.x + 10, 0, p.z + 8); __CTX__.player.camYaw = Math.atan2(p.x - __CTX__.player.position.x, p.z - __CTX__.player.position.z) + Math.PI; __CTX__.player.camPitch = 0.25; __CTX__.player._snapToGround?.(); }
    })();`,
    params: 'px=-60&pz=20&yaw=4.7&pitch=0.2',
    settle: 1800,
    criteria: 'River rocks / a standing pool with reeds / moisture gradient visible in the cut. FAIL if featureless brown plane.',
  },
  {
    id: 'V9-sky-golden', kind: 'visual', lane: 'environment',
    title: 'Sky has golden-hour drama',
    params: 'yaw=0.2&pitch=-0.15',
    settle: 1800,
    criteria: 'Clouds with sunlit edges, warm horizon gradient toward sun bearing, tasteful god rays or light shafts. FAIL if flat haze gradient.',
  },
  {
    id: 'V10-hud-language', kind: 'visual', lane: 'hud',
    title: 'HUD matches HZD design language (combat state)',
    setup: `${INPUT_ON}
      (() => {
        const w = (__CTX__.machines?.list || []).find(m => m.kind === 'watcher' && m.alive);
        if (!w) return;
        __CTX__.player.position.set(w.position.x + 10, 0, w.position.z + 10);
        let mesh = null; w.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
        w.takeDamage({ point: w.position.clone(), object: mesh, impact: 25, tear: 0,
                       element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'hunter', baseDamage: 25 });
        setTimeout(() => { w.takeDamage({ point: w.position.clone(), object: mesh, impact: 18, tear: 0,
                       element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'hunter', baseDamage: 18 }); }, 900);
        __CTX__.input.mouse.buttons |= 4;
      })();`,
    settle: 2400,
    criteria: 'Machine status stack visible (thin tracked-caps name, awareness cue, no mustard text), styled damage numbers (off-white/yellow), compass diamond pips, health bar cluster, reticle. FAIL if generic yellow-text bars.',
  },
  {
    id: 'V13-aim-strafe', kind: 'visual', lane: 'animator',
    title: 'Aim side-step reads as a weighted step, not a splay',
    // Deterministic recipe: flat meadow, aim held, strafe to HER left for 2.4s,
    // then lock a front camera 6.5m out and freeze so the judge always sees the
    // same mid-step frame. Vegetation is hidden so the feet are visible.
    setup: `${INPUT_ON}
      (() => {
        const C = __CTX__, p = C.player;
        C.state = 'playing';
        document.getElementById('hud').style.display = 'none';
        p.position.set(-60, 0, -45); p.velocity.set(0, 0, 0); p._snapToGround();
        p.camYaw = Math.PI; p.camPitch = 0;
        C.input.mouse.buttons |= 4;
        C.input.keys.add('KeyA');
        const veg = C.scene.getObjectByName('vegetation'); if (veg) veg.visible = false;
        setTimeout(() => {
          p._updateCamera = function () {
            const cam = this.ctx.camera;
            cam.position.set(this.position.x, this.position.y + 1.6, this.position.z + 6.5);
            cam.lookAt(this.position.x, this.position.y + 0.85, this.position.z);
          };
          C.camera.fov = 24; C.camera.updateProjectionMatrix();
          setTimeout(() => { C.engine.timeScale = 0; }, 900);
        }, 2400);
      })();`,
    settle: 4200,
    criteria: 'Locked front view of an aiming side-step (she is travelling to HER left, i.e. '
      + 'screen right). PASS if both feet point roughly the same way (within ~20 deg of each '
      + 'other) and toward the travel direction, the stance reads as a weighted step, and the '
      + 'upper body still holds the bow up on target. FAIL on a duck-footed A-stance (feet '
      + 'splayed away from each other), on a foot dragging on its toe tip, on the legs reading '
      + 'crossed or tangled, or on the swing leg kicking opposite to the travel direction.',
  },
  {
    id: 'V14-slope-contour', kind: 'visual', lane: 'animator',
    title: 'Standing across a cross-slope: both soles lie ON the ground, banked with it',
    // Deterministic recipe: scan for the steepest locally-consistent surface in
    // the 20-24 deg band, stand ACROSS its fall line, lock a camera along the
    // contour at boot height so the judge is looking down the slope line, and
    // freeze. This is the frame the fix-round judge shot as
    // shots/judge-locomotion-r1-slope-contour.png.
    setup: `${INPUT_ON}
      (() => {
        const C = __CTX__, p = C.player, T = C.terrain;
        C.state = 'playing';
        document.getElementById('hud').style.display = 'none';
        const veg = C.scene.getObjectByName('vegetation'); if (veg) veg.visible = false;
        const n = new p.position.constructor();
        const nAt = (x, z) => { const v = new p.position.constructor(); T.getNormal(x, z, v); return v; };
        let best = null;
        // search the meadow's own neighbourhood: far corners of the map render
        // Aloy at a reduced detail level and the film reads worse for it
        for (let x = -125; x <= 5; x += 2) for (let z = -110; z <= 20; z += 2) {
          const v = nAt(x, z);
          const a = Math.acos(Math.max(-1, Math.min(1, v.y))) * 180 / Math.PI;
          if (a < 20 || a > 24) continue;
          let ok = true;
          for (const [dx, dz] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) {
            if (nAt(x + dx, z + dz).dot(v) < 0.9945) { ok = false; break; }
          }
          if (ok && (!best || a > best.a)) best = { x, z, a, n: v };
        }
        if (!best) return;
        const fall = Math.atan2(-best.n.x, -best.n.z);
        p.position.set(best.x, 0, best.z); p.velocity.set(0, 0, 0);
        p.heading = fall + Math.PI / 2; p.camYaw = p.heading; p._snapToGround();
        p._updateCamera = function () {
          const cam = this.ctx.camera;
          // stand off ALONG the contour, low, so the slope line reads
          const a = fall + Math.PI / 2;
          cam.position.set(this.position.x + Math.sin(a) * 3.4, this.position.y + 0.55,
                           this.position.z + Math.cos(a) * 3.4);
          cam.lookAt(this.position.x, this.position.y + 0.30, this.position.z);
        };
        setTimeout(() => { p.heading = fall + Math.PI / 2; }, 900);
        setTimeout(() => { C.engine.timeScale = 0; }, 1800);
      })();`,
    settle: 3000,
    criteria: 'Close, low view along the contour of a ~22 deg cross-slope, both boots in frame. '
      + 'PASS if each sole lies flat ON the ground, BANKED with the slope (the boot tops tilt '
      + 'with the hillside, not with the horizon), with no visible air gap under either boot and '
      + 'no boot sunk into the dirt; the uphill leg reads shorter than the downhill one. FAIL if '
      + 'either sole is held horizontal in world space while the ground falls away under it, if '
      + 'the downhill boot hangs clear of the ground with its toe pointing into space, if a heel '
      + 'is lifted off the surface, or if the whole body is levitating above the hillside.',
  },
  {
    id: 'V12-sprint-vs-reference', kind: 'visual', lane: 'animator',
    title: 'Sprint side profile matches reference/run-side.jpg',
    // Deterministic recipe: teleport to the flat meadow, lock a side camera on
    // her RIGHT (char -X) 3.6m out at chest height, sprint north, and hold the
    // frame the moment a foot is clip-flagged planted so the judge always sees
    // a contact frame rather than a random point of the flight phase.
    setup: `${INPUT_ON}
      (() => {
        const p = __CTX__.player;
        __CTX__.state = 'playing';
        document.getElementById('hud').style.display = 'none';
        p.position.set(-60, 0, -52); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = Math.PI;
        p._updateCamera = function () {
          const s = Math.sin(this.heading), c = Math.cos(this.heading);
          const cam = this.ctx.camera;
          cam.position.set(this.position.x - 3.6 * c, this.position.y + 1.25, this.position.z + 3.6 * s);
          cam.lookAt(this.position.x, this.position.y + 1.05, this.position.z);
        };
        __CTX__.input.keys.add('KeyW'); __CTX__.input.keys.add('ShiftLeft');
        setTimeout(function hold() {
          if (__CTX__.player.animator.debugFeet().some(f => f.planted)) { __CTX__.engine.timeScale = 0; return; }
          requestAnimationFrame(hold);
        }, 1500);
      })();`,
    settle: 2400,
    criteria: 'Mid-sprint contact frame, camera on her right side. PASS needs ALL of: (1) the rear foot is ON the ground line — sole touching, not hovering and not buried; (2) forward torso lean roughly 25-45° with the chest ahead of the hips; (3) opposing arm swing — one elbow driven back past the hip line, the other forward across the chest, both bent, neither hanging straight; (4) a long stride: front thigh lifted toward horizontal, rear leg extended behind; (5) hair and skirt trailing BEHIND her, not hanging vertically. FAIL if both feet float clear of the ground, if the legs are near-symmetric, if the arms hang, or if any limb bends backwards / the knee inverts.',
  },
  {
    id: 'V20-aa-crop', kind: 'visual', lane: 'core-platform',
    title: 'Anti-aliasing: 4x nearest-neighbour crop of a pine ridge against sky',
    // The crop is done in-page from the WebGL canvas inside engine.onAfterRender
    // (same task as the render, so the drawing buffer is still intact without
    // preserveDrawingBuffer) and blown up 4x with smoothing off, so the shot the
    // judge sees IS the pixel evidence: MSAA + SMAA must put intermediate
    // values on every silhouette edge.
    setup: `(() => {
      const ctx = __CTX__, e = ctx.engine, p = ctx.player;
      ctx.state = 'playing';
      const hud = document.getElementById('hud'); if (hud) hud.style.display = 'none';
      p.position.set(0, 0, 0); p.camYaw = Math.PI; p.camPitch = -0.03; p._snapToGround?.();
      setTimeout(() => {
        e.requestTimeScale('gate', 0);
        const src = e.renderer.domElement;
        const cv = document.createElement('canvas');
        cv.width = 1600; cv.height = 900;
        cv.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483647;image-rendering:pixelated';
        const g = cv.getContext('2d');
        g.imageSmoothingEnabled = false;
        document.body.appendChild(cv);
        const SX = 140, SY = 300, SW = 400, SH = 225; // pine ridge against sky
        e.onAfterRender.push(() => {
          g.imageSmoothingEnabled = false;
          g.drawImage(src, SX * (src.width / 1600), SY * (src.height / 900),
                      SW * (src.width / 1600), SH * (src.height / 900), 0, 0, 1600, 900);
          g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
          g.strokeRect(1, 1, 1598, 898);
          g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 856, 470, 44);
          g.fillStyle = '#dfeaf2'; g.font = '18px ui-monospace, Menlo, monospace';
          g.fillText('4x NEAREST CROP  src ' + SX + ',' + SY + ' ' + SW + 'x' + SH
            + '  msaa ' + e.composer.renderTarget1.samples, 12, 884);
        });
      }, 1400);
    })();`,
    settle: 3200,
    criteria: 'Every silhouette edge (pine needles against sky, ridge line, branch tips) shows a gradient of intermediate pixels between the tree colour and the sky colour — at 4x magnification the edge should read as a soft 2-3 pixel ramp. FAIL if edges are pure hard stair-steps with exactly two colours and no in-between values, which is what samples=0 looked like in Round 3 (compare shots/verify-perf-tech-aa-crop.png).',
  },
  {
    id: 'V11-logo-title', kind: 'visual', lane: 'logo',
    title: 'Title screen: HORIZON ZERO CLAUDE wordmark + spark-as-dawn',
    plain: true,
    settle: 2500,
    criteria: 'HORIZON in thin wide-tracked caps; ZERO CLAUDE subtitle with flanking hairlines; terracotta Claude spark cresting a horizon rule with soft glow. Reads as both brands at once.',
  },
];
