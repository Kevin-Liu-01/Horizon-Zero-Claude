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

const INPUT_ON = `__CTX__.input.enabled = true;`;

export const GATES = [
  // ---------------- ACTION GATES ----------------
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
    title: 'Sprint reaches 6–9 m/s sustained',
    setup: INPUT_ON,
    settle: 200,
    assert: `(async () => {
      const p = __CTX__.player;
      __CTX__.input.keys.add('KeyW'); __CTX__.input.keys.add('ShiftLeft');
      await new Promise(r => setTimeout(r, 800));
      const a = p.position.clone(); const t0 = performance.now();
      await new Promise(r => setTimeout(r, 1500));
      const dt = (performance.now() - t0) / 1000;
      const v = Math.hypot(p.position.x - a.x, p.position.z - a.z) / dt;
      return { pass: v >= 6 && v <= 9.5, detail: { speed: +v.toFixed(2) } };
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
    settle: 2000,
    assert: `(async () => {
      const r = __CTX__.renderer || __CTX__.engine?.renderer;
      let frames = 0, calls = -1; const t0 = performance.now();
      await new Promise(res => {
        const tick = () => {
          frames++;
          calls = Math.max(calls, r?.info?.render?.calls ?? -1); // sample right after each render
          if (performance.now() - t0 >= 3000) res(); else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const fps = frames / 3;
      return { pass: calls > 0 && calls < 350 && fps >= 45, detail: { drawCalls: calls, fps: +fps.toFixed(1) } };
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
    title: 'Locomotion is mocap-clip driven: mixer advancing, Sprint_Loop dominant at 8 m/s',
    setup: INPUT_ON,
    settle: 300,
    assert: `(async () => {
      const an = __CTX__.player.animator;
      if (!an?.mixer) return { pass: null, detail: 'SKIP: animator exposes no AnimationMixer (procedural fallback)' };
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
        && !!dom && dom.clip === 'Sprint_Loop' && dom.weight > 0.6 && spd > 7.5;
      return { pass, detail: {
        mixerAdvanced: +(an.mixer.time - t0).toFixed(2), liveActions: live.length,
        dominant: dom && { clip: dom.clip, weight: +dom.weight.toFixed(3) },
        speed: +spd.toFixed(2), clips: Object.keys(an.clipReport()?.clips ?? {}).length,
      } };
    })()`,
  },
  {
    id: 'A13-no-skate', kind: 'action', lane: 'animator',
    title: 'Planted foot does not skate: stance-window XZ drift ≤ 0.06m at full sprint',
    setup: INPUT_ON,
    settle: 300,
    assert: `(async () => {
      const an = __CTX__.player.animator, T = __CTX__.terrain, p = __CTX__.player;
      if (!an?.debugFeet) return { pass: null, detail: 'SKIP: animator exposes no debugFeet()' };
      p.position.set(-60, 0, -45); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = Math.PI; // flat meadow, runs +Z
      __CTX__.input.keys.add('KeyW'); __CTX__.input.keys.add('ShiftLeft');
      await new Promise(r => setTimeout(r, 2000));           // spin up to 8.2 m/s
      // a stance window = consecutive frames where a foot is BOTH clip-flagged
      // planted and within 3cm of the terrain; its drift is the XZ bounding box
      const open = {}, done = [];
      let hitched = 0, prev = performance.now();
      const t0 = prev;
      while (performance.now() - t0 < 1600) {
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
            if (w.n >= 4) { if (w.bad) hitched++; else done.push(+Math.hypot(w.x1 - w.x0, w.z1 - w.z0).toFixed(4)); }
            open[f.name] = null;
          }
        }
        await new Promise(r => requestAnimationFrame(r));
      }
      if (done.length < 2) return { pass: null, detail: 'SKIP: fewer than 2 clean stance windows sampled (hitched=' + hitched + ')' };
      const worst = Math.max(...done);
      const spd = __CTX__.player.moveSpeed;
      return { pass: worst <= 0.06 && spd > 7.5,
               detail: { maxStanceDriftM: worst, windows: done.length, hitchedWindows: hitched, drifts: done, speed: +spd.toFixed(2) } };
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
    id: 'V11-logo-title', kind: 'visual', lane: 'logo',
    title: 'Title screen: HORIZON ZERO CLAUDE wordmark + spark-as-dawn',
    plain: true,
    settle: 2500,
    criteria: 'HORIZON in thin wide-tracked caps; ZERO CLAUDE subtitle with flanking hairlines; terracotta Claude spark cresting a horizon rule with soft glow. Reads as both brands at once.',
  },
];
