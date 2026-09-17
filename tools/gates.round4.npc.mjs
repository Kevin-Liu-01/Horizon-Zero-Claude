/**
 * Round 4 gates — lane `npc` (docs/ROUND4-AUDIT.md §4, Wave 4 expansion).
 *
 * Same contract as tools/gates.config.mjs: every gate runs JS in page context
 * with `__CTX__` / `__GAME__` available and resolves `{ pass, detail }`. The
 * runner screenshots each one, so the two "visual" bars of the audit (V40, V41)
 * are filmed AND measured here rather than left to an opinion:
 *
 *   A95  the roster is counted and fingerprinted — distinct BODIES, by mesh
 *        and vertex-colour signature, not by name.
 *   A96  60 seconds of simulation, sampled: every mixer advances, every NPC
 *        plays three different clips, and four of them cover 8 m of route.
 *   A97  A13-no-skate's stance-window probe, per walking NPC, with the same
 *        exclusions that gate makes plus one this lane needs (see below).
 *   V40  dusk at the camp: the NPCs in frame are counted by projecting them
 *        into the rendered view, and their activities are counted by the clip
 *        each is actually playing.
 *   V41  two different bodies side by side, walking: proved different by
 *        signature, proved animated by mixer clocks, proved un-T-posed by the
 *        measured elbow/knee angles.
 *
 * ID NOTE. `A95` is already taken by `A95-combat-teardown` in the combat lane's
 * file; these ids are the audit's own full strings (`A95-npc-roster`, …) and do
 * not collide with it or with anything else registered.
 */

/** Page-context helper: wait for the crowd to exist and settle. */
const CROWD = `
  const ctx = __CTX__;
  const t0 = performance.now();
  while (!ctx.npcs?.ok && performance.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 120));
  }
  const S = ctx.npcs;
  if (!S) return { pass: null, detail: 'SKIP: ctx.npcs is not installed' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(r));
`;

/**
 * Page-context helper: run the simulation for `seconds` of SIM time, sampling
 * `onSample` every frame. Sim time is read from engine.simTime so a slow box
 * or a timeScale change cannot turn a 60 s bar into a 20 s one.
 */
const RUN_SIM = `
  const runSim = async (seconds, onSample) => {
    const e = ctx.engine;
    const start = e.simTime;
    let guard = 0;
    while (e.simTime - start < seconds && guard < 60000) {
      await frame();
      guard++;
      if (onSample) onSample(e.simTime - start);
    }
    return e.simTime - start;
  };
`;

/** Page-context helper: drop the player in the middle of camp, HUD off. */
const IN_CAMP = `
  const p = ctx.player;
  p.position.set(22, 0, 30);
  p._snapToGround?.();
  document.getElementById('hud')?.classList.add('hidden');
`;

export const GATES = [
  /* ------------------------------------------------------------------ A95 */
  {
    id: 'A95-npc-roster', kind: 'action', lane: 'npc',
    title: '13 named NPCs in the camp across 6 distinct body builds, each its own skinned mesh',
    settle: 2500, timeout: 60000,
    assert: `(async () => {
      ${CROWD}
      ${IN_CAMP}
      await sleep(500);
      const d = S.debug();

      /* ---- 1. count ---- */
      const count = d.count;

      /* ---- 2. DISTINCT BODIES, measured. A tint is not a variant: the
         signature hashes the vertex and index counts together with eight
         evenly spaced colour taps, so two NPCs collide only if they are the
         same mesh in the same palette. The build label is counted separately
         so a signature change cannot quietly stand in for a silhouette. ---- */
      const sigs = new Set(d.npcs.map((n) => n.signature));
      const builds = new Set(d.npcs.map((n) => n.body));

      /* ---- 3. every NPC is a real skinned mesh on a real skeleton ---- */
      const meshes = [];
      let skinned = 0, bones = 0, badBind = 0;
      for (const n of S.list) {
        meshes.push(n.mesh.name);
        if (n.mesh.isSkinnedMesh && n.mesh.skeleton) {
          skinned++;
          bones += n.mesh.skeleton.bones.length;
          // every NPC must own its skeleton — a shared one would pose them all
          // identically and is the classic way a "crowd" turns out to be one guy
          if (n.mesh.skeleton === S.list[0].mesh.skeleton && n !== S.list[0]) badBind++;
        }
      }
      const uniqueSkeletons = new Set(S.list.map((n) => n.mesh.skeleton)).size;

      /* ---- 4. they are registered where the rest of the game can find them --- */
      const inScene = ctx.scene.getObjectByName('npc-crowd');
      const talkable = ctx.interactables
        ? ctx.interactables.list.filter((e) => /TALK/.test(e.label || '')).length : 0;
      const colliders = ctx.collision ? ctx.collision.count('npc') : 0;

      const detail = {
        count, distinctSignatures: sigs.size, distinctBuilds: builds.size,
        builds: [...builds], skinnedMeshes: skinned, uniqueSkeletons,
        bonesPerNpc: skinned ? Math.round(bones / skinned) : 0,
        sharedSkeletonBugs: badBind,
        crowdGroup: !!inScene, talkInteractables: talkable, npcColliders: colliders,
        roster: d.npcs.map((n) => n.id + ':' + n.body + ':' + n.signature),
      };
      const pass = count >= 10 && sigs.size === count && builds.size >= 4
        && skinned === count && uniqueSkeletons === count && badBind === 0
        && !!inScene && colliders >= count && talkable >= count - 1;
      return { pass, detail };
    })()`,
  },

  /* ------------------------------------------------------------------ A96 */
  {
    id: 'A96-npc-animated', kind: 'action', lane: 'npc',
    title: 'Over 60 sim s every NPC mixer advances, every NPC plays ≥3 clips, ≥4 walk ≥8 m of route',
    settle: 2000, timeout: 220000,
    assert: `(async () => {
      ${CROWD}
      ${RUN_SIM}
      ${IN_CAMP}
      await sleep(400);

      const start = S.list.map((n) => ({
        id: n.id,
        mixer: n.anim.mixer.time,
        layers: n.anim.layers.time,
        walked: n.walked,
      }));
      const startClips = new Map(S.list.map((n) => [n.id, new Set(n.anim.clipsPlayed)]));

      /**
       * 60 SECONDS OF SIM, NOT OF WALL CLOCK. Sixteen lanes share this box and
       * a 60 s stopwatch can buy 25 s of simulation; engine.simTime is the
       * clock the behaviour loop actually runs on.
       */
      let minStep = Infinity;
      const prev = new Map(S.list.map((n) => [n.id, n.anim.mixer.time]));
      const stalled = new Set();
      const simmed = await runSim(60, () => {
        for (const n of S.list) {
          const t = n.anim.mixer.time;
          const was = prev.get(n.id);
          if (t < was - 1e-6) stalled.add(n.id + ':rewound');
          prev.set(n.id, t);
        }
      });

      const rows = S.list.map((n, i) => {
        const s = start[i];
        const clips = new Set(n.anim.clipsPlayed);
        const fresh = [...clips].filter((c) => !startClips.get(n.id).has(c));
        return {
          id: n.id, role: n.role, state: n.state,
          mixerAdvance: +(n.anim.mixer.time - s.mixer).toFixed(2),
          layerAdvance: +(n.anim.layers.time - s.layers).toFixed(2),
          clips: [...clips], clipCount: clips.size, newClips: fresh.length,
          walked: +(n.walked - s.walked).toFixed(2),
          stuck: n.anim.stuck(),
        };
      });

      const mixersOk = rows.every((r) => r.mixerAdvance > simmed * 0.35);
      const clipsOk = rows.every((r) => r.clipCount >= 3);
      const travellers = rows.filter((r) => r.walked >= 8).length;
      const anyStuck = rows.filter((r) => r.stuck.length);
      const minMixer = Math.min(...rows.map((r) => r.mixerAdvance));

      return {
        pass: mixersOk && clipsOk && travellers >= 4 && anyStuck.length === 0 && stalled.size === 0,
        detail: {
          simSeconds: +simmed.toFixed(1), npcs: rows.length,
          minMixerAdvance: +minMixer.toFixed(2),
          npcsWithThreeClips: rows.filter((r) => r.clipCount >= 3).length,
          travellersOver8m: travellers,
          stuckLayers: anyStuck, rewound: [...stalled],
          rows,
        },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ A97 */
  {
    id: 'A97-npc-no-skate', kind: 'action', lane: 'npc',
    title: 'Planted-foot drift on walking NPCs ≤ 0.08 m (A13 stance-window probe)',
    settle: 2000, timeout: 180000,
    assert: `(async () => {
      ${CROWD}
      ${IN_CAMP}
      await sleep(6000);          // let the routes resolve and the walkers start

      /**
       * A13's probe, per NPC. A stance window is the run of frames a foot is
       * the support foot; its drift is the XZ bounding box of that foot's
       * world position over the window. The NPC's translation is DERIVED from
       * the support foot (src/world/npc/npcAnim.js), so a correct lock reports
       * zero and any number here is real sliding.
       *
       * THE SAME THREE EXCLUSIONS A13 MAKES, plus one this lane needs:
       *   - a window spanning a dropped frame is discarded (measurement noise);
       *   - a window spanning a clip change is discarded (the pose is
       *     crossfading, not walking);
       *   - a window in which the LOCK RE-ANCHORED is discarded — the animator
       *     bumps lockEpoch when the world shoves the body out of a prop, or
       *     when a base loop changes. A body being pushed by geometry is not a
       *     measurement of the animation, which is exactly why A13 stages its
       *     own sprint on open ground instead of into the camp.
       * The count of each is REPORTED, and the gate fails if the exclusions
       * eat the sample (a lane cannot pass by discarding everything).
       */
      const open = Object.create(null);
      const done = [];
      let hitched = 0, clipChanged = 0, reanchored = 0;
      let prev = performance.now();
      const probe0 = prev;
      while (performance.now() - probe0 < 22000) {
        const now = performance.now();
        const hitch = now - prev > 45;
        prev = now;
        for (const f of S.walkingFeet()) {
          const key = f.id + ':' + f.name;
          const w = open[key];
          if (f.planted) {
            if (!w) {
              open[key] = { id: f.id, x0: f.world.x, x1: f.world.x, z0: f.world.z, z1: f.world.z,
                n: 1, bad: hitch, clip: f.clip, clipBad: false, epoch: f.epoch, epochBad: false };
            } else {
              w.x0 = Math.min(w.x0, f.world.x); w.x1 = Math.max(w.x1, f.world.x);
              w.z0 = Math.min(w.z0, f.world.z); w.z1 = Math.max(w.z1, f.world.z);
              w.n++;
              if (hitch) w.bad = true;
              if (f.clip !== w.clip) w.clipBad = true;
              if (f.epoch !== w.epoch) w.epochBad = true;
            }
          } else if (w) {
            if (w.n >= 3) {
              if (w.bad) hitched++;
              else if (w.clipBad) clipChanged++;
              else if (w.epochBad) reanchored++;
              else done.push({ id: w.id, n: w.n, d: +Math.hypot(w.x1 - w.x0, w.z1 - w.z0).toFixed(4) });
            }
            open[key] = null;
          }
        }
        await new Promise((r) => requestAnimationFrame(r));
      }

      const ids = [...new Set(done.map((w) => w.id))];
      if (done.length < 10 || ids.length < 3) {
        return { pass: false, detail: { reason: 'too few clean stance windows to judge',
          clean: done.length, npcs: ids.length, hitched, clipChanged, reanchored } };
      }
      done.sort((a, b) => b.d - a.d);
      const worst = done[0].d;
      const median = done[Math.floor(done.length / 2)].d;
      const excluded = hitched + clipChanged + reanchored;

      return {
        pass: worst <= 0.08 && excluded < done.length,
        detail: {
          maxStanceDriftM: worst, medianDriftM: median,
          cleanWindows: done.length, npcsSampled: ids.length, npcs: ids,
          excludedHitched: hitched, excludedClipChange: clipChanged, excludedReanchor: reanchored,
          worstFive: done.slice(0, 5),
          gaits: S.gaits,
        },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ V40 */
  {
    id: 'V40-settlement-life', kind: 'action', lane: 'npc',
    title: 'Camp at dusk: ≥6 NPCs in frame doing ≥4 visibly different things',
    settle: 2500, timeout: 140000,
    assert: `(async () => {
      ${CROWD}
      ${RUN_SIM}
      ${IN_CAMP}
      ctx.environment.setWeather('clear', 0);
      ctx.environment.setTime(19.4);
      await runSim(14, null);       // let the camp fall into its evening shape

      /**
       * Frame the plaza the way V35-settlement does, then COUNT what is in
       * the shot instead of describing it: each NPC is projected through the
       * live camera, and only the ones inside the frustum, in front of the
       * lens and not behind the terrain count. "Different things" is the clip
       * each one is actually playing plus its behaviour state — a number the
       * page can produce and a judge can check against the PNG.
       */
      const cam = ctx.camera;
      const V = ctx.player.position.constructor;
      const fy = ctx.camp.firePosition.y;
      cam.position.set(9.0, fy + 6.2, 16.0);
      cam.lookAt(21.4, fy + 1.1, 30.6);
      cam.updateMatrixWorld(true);
      cam.updateProjectionMatrix();
      /**
       * FILM THE FRAME THAT WAS MEASURED. The runner screenshots after the
       * assert returns, and player.update() rewrites the camera every frame
       * — so a gate that composes a shot and then hands control back gets a
       * PNG of the chase camera and a verdict about a view nobody sees. Park
       * the render loop on the composed frame; the page is thrown away after
       * this gate anyway.
       */
      ctx.renderer.setAnimationLoop(null);
      for (let i = 0; i < 3; i++) { ctx.engine._shadowCullClock = 0; ctx.engine.render(0.05); }

      const inFrame = [];
      for (const n of S.list) {
        const v = new V(n.group.position.x, n.group.position.y + 1.0, n.group.position.z);
        const d = v.distanceTo(cam.position);
        v.project(cam);
        if (!(v.z > -1 && v.z < 1)) continue;
        if (Math.abs(v.x) > 0.96 || Math.abs(v.y) > 0.94) continue;
        // not buried in the knoll between the lens and the person
        let blocked = false;
        const steps = 12;
        for (let k = 1; k < steps; k++) {
          const t = k / steps;
          const sx = cam.position.x + (n.group.position.x - cam.position.x) * t;
          const sz = cam.position.z + (n.group.position.z - cam.position.z) * t;
          const sy = cam.position.y + (n.group.position.y + 1.0 - cam.position.y) * t;
          if (ctx.terrain.getHeight(sx, sz) > sy + 0.25) { blocked = true; break; }
        }
        if (blocked) continue;
        inFrame.push({ id: n.id, role: n.role, state: n.state, clip: n.anim.current,
          dist: +d.toFixed(1) });
      }

      const activities = new Set(inFrame.map((n) => n.state + '/' + n.clip));
      const clips = new Set(inFrame.map((n) => n.clip));
      // lit braziers are world-props' bar, but a dusk camp with nobody visible
      // is this lane's failure, so the light is only reported
      const braziers = (ctx.camp.brazierLights || []).length;

      return {
        pass: inFrame.length >= 6 && activities.size >= 4,
        detail: {
          hour: +ctx.environment.time.toFixed(2),
          npcsInFrame: inFrame.length, distinctActivities: activities.size,
          distinctClips: [...clips], activities: [...activities],
          inFrame, totalNpcs: S.count, braziers,
        },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ V41 */
  {
    id: 'V41-npc-closeup', kind: 'action', lane: 'npc',
    title: 'Two different NPC bodies side by side, walking: different builds, natural gait, no T-pose',
    settle: 2500, timeout: 140000,
    assert: `(async () => {
      ${CROWD}
      ${RUN_SIM}
      ${IN_CAMP}
      ctx.environment.setWeather('clear', 0);
      ctx.environment.setTime(10.5);

      /**
       * Two walkers of DIFFERENT builds are put side by side on the open
       * meadow and told to walk the same way, and then everything the audit
       * asks for is measured rather than eyeballed:
       *   different bodies  — signature + build + measured standing height
       *   natural gait      — the knee actually bends through the cycle
       *   no T-pose         — the arms are down (the T-pose's tell is a
       *                       horizontal upper arm), measured as the angle
       *                       between the shoulder->hand vector and world up
       *   no foot skate     — both mixers advance and both bodies travel
       */
      const a = S.list.find((n) => n.routeName && n.body === 'tall')
        || S.list.find((n) => n.routeName);
      const b = S.list.find((n) => n.routeName && n.body !== a.body && n !== a)
        || S.list.find((n) => n !== a && n.routeName);
      if (!a || !b) return { pass: false, detail: { reason: 'fewer than two walkers on the roster' } };

      const X0 = -60, Z0 = -45;
      const pair = [a, b];
      /**
       * PUT ONLY THE WALK ON STAGE.
       *
       * The layer set normalizes override weights, so a fidget one-shot still
       * carrying weight (a Punch_Jab, an Interact) does not merely sit on top
       * of the walk — it DIVIDES it. Measured on SONA: current === 'walk' the
       * whole take, mixer advancing, and a 0.68 rad knee swing at a quarter of
       * her nominal speed, because half the pose was still an idle. A gate that
       * films a walk has to be sure it is filming a walk.
       */
      const soloWalk = (n) => {
        for (const l of n.anim.slots.values()) { l.cancel(0); l.setWeight(0); }
        n.anim.current = null;
        n.anim.play('walk', { fade: 0, rate: n.speed });
        n.anim.slots.get('walk')?.setWeight(1);
      };
      pair.forEach((n, i) => {
        n.group.position.set(X0 + (i - 0.5) * 1.15, ctx.terrain.getHeight(X0 + (i - 0.5) * 1.15, Z0), Z0);
        n.group.rotation.y = 0;
        n.state = 'goto';
        n.gotoThen = 'idle';
        n.stateT = 60;
        n.leg = null;
        n.target.set(n.group.position.x, 0, Z0 + 30);
        soloWalk(n);
      });
      ctx.player.position.set(X0, 0, Z0 - 8);
      ctx.player._snapToGround?.();
      if (ctx.player.model) ctx.player.model.visible = false;

      const V = ctx.player.position.constructor;
      const kneeRange = [0, 0];
      const dropSum = [0, 0], dropN = [0, 0];
      const start = pair.map((n) => ({ x: n.group.position.x, z: n.group.position.z, m: n.anim.mixer.time }));
      const kneeMin = [9, 9], kneeMax = [-9, -9];
      const hip = new V(), knee = new V(), ankle = new V(), sh = new V(), hand = new V();
      const bone = (n, re) => { for (const o of n.byName.values()) if (re.test(o.name)) return o; return null; };

      const total = 8;
      await runSim(total, (t) => {
        pair.forEach((n, i) => {
          /**
           * KEEP THE TAKE RUNNING. The behaviour loop's own stuck-watchdog
           * would stand these two up after a second of walking straight past
           * everything it knows about, and the gate is measuring the GAIT, not
           * the brain. Its clock is held at zero for the length of the shot and
           * the walk is re-issued if anything else claims the stage.
           */
          n.progT = 0;
          n.detourT = 0;
          n.blockedFor = 0;
          n.stateT = 60;
          if (n.state !== 'goto') { n.state = 'goto'; n.gotoThen = 'idle'; n.leg = null; }
          // aim 30 m straight ahead of where it is NOW: the heading error stays
          // at zero, so the take measures the gait and not the pathfinder
          n.target.set(
            n.group.position.x + Math.sin(n.group.rotation.y) * 30,
            0,
            n.group.position.z + Math.cos(n.group.rotation.y) * 30,
          );
          if (n.anim.current !== 'walk' || (n.anim.slots.get('walk')?.weight ?? 0) < 0.92) soloWalk(n);

          if (t < total * 0.25) return;      // let the first steps settle
          const th = bone(n, /thigh.?L$/i);
          const sn = bone(n, /shin.?L$/i);
          const ft = bone(n, /foot.?L$/i);
          const shl = bone(n, /upper_arm.?L$/i);
          const hl = bone(n, /hand.?L$/i);
          if (th && sn && ft) {
            hip.setFromMatrixPosition(th.matrixWorld);
            knee.setFromMatrixPosition(sn.matrixWorld);
            ankle.setFromMatrixPosition(ft.matrixWorld);
            const u = hip.clone().sub(knee).normalize();
            const v = ankle.clone().sub(knee).normalize();
            const ang = Math.acos(Math.max(-1, Math.min(1, u.dot(v))));
            kneeMin[i] = Math.min(kneeMin[i], ang);
            kneeMax[i] = Math.max(kneeMax[i], ang);
          }
          if (shl && hl) {
            /**
             * THE T-POSE TELL IS HEIGHT, NOT ANGLE. A T-pose holds the hand at
             * shoulder height; a walk holds it near the hip and swings it. The
             * first cut took the MAX arm-from-vertical angle over the shot,
             * which a single frame of a gesture or of the crossfade in could
             * push past the bar on a perfectly good walk cycle (measured: 1.89
             * rad on BAST while he was plainly walking). Mean vertical drop is
             * the honest statistic: ~0 in a T-pose, ~0.4 m in any locomotion.
             */
            sh.setFromMatrixPosition(shl.matrixWorld);
            hand.setFromMatrixPosition(hl.matrixWorld);
            dropSum[i] += (sh.y - hand.y);
            dropN[i]++;
          }
        });
      });

      const armDrop = dropSum.map((v, i) => +(dropN[i] ? v / dropN[i] : 0).toFixed(3));
      pair.forEach((n, i) => { kneeRange[i] = +(kneeMax[i] - kneeMin[i]).toFixed(3); });
      const travelled = pair.map((n, i) => +Math.hypot(
        n.group.position.x - start[i].x, n.group.position.z - start[i].z).toFixed(2));
      const mixerRan = pair.map((n, i) => +(n.anim.mixer.time - start[i].m).toFixed(2));

      // heights, measured from the live skinned bounds
      const heights = pair.map((n) => {
        n.group.updateMatrixWorld(true);
        const head = [...n.byName.values()].find((o) => /DEF-head$/.test(o.name));
        return head ? +(head.matrixWorld.elements[13] - n.group.position.y + 0.19).toFixed(3) : 0;
      });

      // frame them for the film
      const cam = ctx.camera;
      const gy = ctx.terrain.getHeight(X0, Z0);
      const mid = (pair[0].group.position.z + pair[1].group.position.z) / 2;
      cam.position.set(X0, gy + 1.15, mid - 3.6);
      cam.lookAt(X0, gy + 1.00, mid);
      cam.updateMatrixWorld(true);
      // park the loop so the PNG is the composed two-shot, not the chase cam
      ctx.renderer.setAnimationLoop(null);
      for (let i = 0; i < 3; i++) { ctx.engine._shadowCullClock = 0; ctx.engine.render(0.05); }

      const detail = {
        pair: pair.map((n, i) => ({
          id: n.id, build: n.body, signature: S.signature(n),
          height: heights[i], scale: +n.variant.scale.toFixed(3),
          kneeSwingRad: kneeRange[i], armDropM: armDrop[i],
          travelledM: travelled[i], mixerSeconds: mixerRan[i], clip: n.anim.current,
        })),
        heightDeltaM: +Math.abs(heights[0] - heights[1]).toFixed(3),
      };
      const pass = pair[0].body !== pair[1].body
        && S.signature(pair[0]) !== S.signature(pair[1])
        && Math.abs(heights[0] - heights[1]) >= 0.05
        && kneeRange.every((k) => k >= 0.5)
        && armDrop.every((m) => m >= 0.25)
        && travelled.every((t) => t >= 2.5)
        && mixerRan.every((m) => m >= 5);
      return { pass, detail };
    })()`,
  },
];
