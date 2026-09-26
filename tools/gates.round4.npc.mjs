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
        pushed: n.pushed,
        sepM: n.sepM,
        ground: 0,
        gx: n.group.position.x, gz: n.group.position.z,
      }));
      const unstick0 = S.unstickCount();
      const byId = new Map(start.map((r) => [r.id, r]));
      const startClips = new Map(S.list.map((n) => [n.id, new Set(n.anim.clipsPlayed)]));

      /**
       * 60 SECONDS OF SIM, NOT OF WALL CLOCK. Sixteen lanes share this box and
       * a 60 s stopwatch can buy 25 s of simulation; engine.simTime is the
       * clock the behaviour loop actually runs on.
       */
      let minStep = Infinity;
      const prev = new Map(S.list.map((n) => [n.id, n.anim.mixer.time]));
      const stalled = new Set();
      /**
       * FIX ROUND 2 — NPC-vs-NPC SEPARATION, THE HALF NOTHING MEASURED.
       *
       * 'crowdDepenetrationM' below is the WORLD shoving a body out of a crate.
       * It says nothing about two bodies occupying one space, and so a judge
       * found OLIN standing inside a seated VALA at 0.031 m centre-to-centre —
       * her face through his abdomen on film — while this gate passed 5/5.
       *
       * Bodies touch at 0.64 m (the 0.32 m collider, twice) and '_separate'
       * holds the crowd at 0.80 m. The bar here is 0.55 m: close enough to
       * allow a shoulder brush and a backstop caught mid-correction, far too
       * far to allow a body inside another. Sampled EVERY FRAME over the whole
       * 60 s — the failure was transient (0.8 % of frames), which is exactly
       * the kind a settle-then-measure gate misses.
       */
      let minSep = Infinity;
      let sepPair = '';
      let framesUnderBar = 0;
      let sepFrames = 0;
      const SEP_BAR = 0.55;
      /**
       * FIX ROUND 3 — SHOW THE DISTRIBUTION, NOT JUST THE MINIMUM (the judge's
       * ask on the round-2 separation fix). One worst number cannot tell a crowd
       * that holds 0.8 m and is caught once mid-correction from a crowd that
       * spends its life at 0.56 m and got lucky. 10 cm buckets over every frame,
       * preallocated, plus the 1st percentile.
       */
      const sepHist = new Int32Array(14);      // 0.0-0.1 .. 1.2-1.3, 1.3+
      const simmed = await runSim(60, () => {
        const s = S.crowdSpacing();
        sepFrames++;
        sepHist[Math.min(13, Math.max(0, Math.floor(s.min * 10)))]++;
        if (s.min < SEP_BAR) framesUnderBar++;
        if (s.min < minSep) { minSep = s.min; sepPair = s.a + '/' + s.b + ' (' + s.states + ')'; }
        for (const n of S.list) {
          const t = n.anim.mixer.time;
          const was = prev.get(n.id);
          if (t < was - 1e-6) stalled.add(n.id + ':rewound');
          prev.set(n.id, t);
          // GROUND covered, not animation consumed. A person held against a
          // prop still consumes its walk clip at full rate, which is exactly
          // how two pinned lookouts passed this gate last round while standing
          // still: 43.4 m of animation against 13.7 m of ground.
          const r = byId.get(n.id);
          r.ground += Math.hypot(n.group.position.x - r.gx, n.group.position.z - r.gz);
          r.gx = n.group.position.x; r.gz = n.group.position.z;
        }
      });

      const rows = S.list.map((n, i) => {
        const s = start[i];
        const clips = new Set(n.anim.clipsPlayed);
        const fresh = [...clips].filter((c) => !startClips.get(n.id).has(c));
        return {
          id: n.id, role: n.role, state: n.state, route: n.routeName || null,
          mixerAdvance: +(n.anim.mixer.time - s.mixer).toFixed(2),
          layerAdvance: +(n.anim.layers.time - s.layers).toFixed(2),
          clips: [...clips], clipCount: clips.size, newClips: fresh.length,
          walked: +(n.walked - s.walked).toFixed(2),
          groundM: +s.ground.toFixed(2),
          pushedM: +(n.pushed - s.pushed).toFixed(2),
          // metres this body was pushed by ANOTHER BODY, not by the world
          sepM: +(n.sepM - s.sepM).toFixed(2),
          unstuck: n.unstuck,
          stuck: n.anim.stuck(),
        };
      });

      const mixersOk = rows.every((r) => r.mixerAdvance > simmed * 0.35);
      const clipsOk = rows.every((r) => r.clipCount >= 3);
      const travellers = rows.filter((r) => r.groundM >= 8).length;
      const anyStuck = rows.filter((r) => r.stuck.length);
      const minMixer = Math.min(...rows.map((r) => r.mixerAdvance));

      /**
       * FIX ROUND 1 — THREE TERMS THE AUDIT'S BLOCKER SLIPPED THROUGH.
       *
       *  - travel is counted on the GROUND, not on the animation clock;
       *  - EVERY route-owner has to cover its 8 m, not just four of the crowd,
       *    because the failure was two specific people pinned in a wall while
       *    four others walked fine;
       *  - nobody may be shoved by the world for more than 1.5 m in the whole
       *    minute (the crowd totalled 26.11 m in 30 s when the audit filmed it,
       *    23.8 m of it on those two), and _unstick() must never have to fire.
       */
      const routers = rows.filter((r) => r.route);
      const lazyRouters = routers.filter((r) => r.groundM < 8);
      const shoved = rows.filter((r) => r.pushedM > 1.5);
      const unstuck = S.unstickCount() - unstick0;
      const totalPush = +rows.reduce((a, r) => a + r.pushedM, 0).toFixed(2);

      return {
        pass: mixersOk && clipsOk && travellers >= 4 && anyStuck.length === 0
          && stalled.size === 0 && lazyRouters.length === 0
          && shoved.length === 0 && unstuck === 0
          && minSep >= SEP_BAR && framesUnderBar === 0,
        detail: {
          simSeconds: +simmed.toFixed(1), npcs: rows.length,
          minPairwiseSeparationM: +minSep.toFixed(3),
          minPairwiseSeparationBar: SEP_BAR,
          closestPair: sepPair,
          framesUnderSeparationBar: framesUnderBar,
          separationSamples: sepFrames,
          // 10 cm buckets of the crowd's closest pair, every frame of the minute
          separationHistogram: Object.fromEntries([...sepHist]
            .map((c, i) => [(i / 10).toFixed(1) + (i === 13 ? '+' : '-' + ((i + 1) / 10).toFixed(1)), c])
            .filter(([, c]) => c > 0)),
          separationP01: (() => {
            const want = Math.max(1, Math.floor(sepFrames * 0.01));
            let acc = 0;
            for (let i = 0; i < sepHist.length; i++) {
              acc += sepHist[i];
              if (acc >= want) return +(i / 10).toFixed(1) + '-' + +((i + 1) / 10).toFixed(1);
            }
            return '1.3+';
          })(),
          unstickTrace: S.unstickTrace(),
          loopTravel: S.loopTravel,
          crowdPushM: +rows.reduce((a, r) => a + r.sepM, 0).toFixed(2),
          minMixerAdvance: +minMixer.toFixed(2),
          npcsWithThreeClips: rows.filter((r) => r.clipCount >= 3).length,
          travellersOver8m: travellers,
          routeOwners: routers.length, routeOwnersUnder8m: lazyRouters.map((r) => r.id),
          crowdDepenetrationM: totalPush,
          worstPushedM: Math.max(0, ...rows.map((r) => r.pushedM)),
          npcsShovedOver1p5m: shoved.map((r) => r.id + ':' + r.pushedM),
          unstickEvents: unstuck,
          stuckLayers: anyStuck, rewound: [...stalled],
          rows,
        },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ A97 */
  {
    id: 'A97-npc-no-skate', kind: 'action', lane: 'npc',
    title: 'Planted-foot drift ≤ 0.08 m on WALKING AND WORKING NPCs, shoved windows INCLUDED',
    settle: 2000, timeout: 200000,
    assert: `(async () => {
      ${CROWD}
      ${IN_CAMP}
      await sleep(6000);          // let the routes resolve and the walkers start

      /**
       * FIX ROUND 1 — THIS GATE USED TO EXCLUDE EXACTLY THE FRAMES THE AUDIT IS
       * ABOUT, AND MEASURE A TAUTOLOGY THE REST OF THE TIME.
       *
       * Two things were wrong and a judge caught both.
       *
       * 1. It read 'walkingFeet().world' — the foot lock's CARRIED pivot, which
       *    is 'g.position_k + R*v_k*s' by construction and therefore identical
       *    every frame a window is undisturbed. "0.0000 m over 93 windows" was
       *    not a measurement. It now reads 'raw': the toe bone's own
       *    'matrixWorld' translation, re-read from a fresh matrix update, which
       *    carries every shove the world applied that frame.
       *
       * 2. It discarded every window in which 'lockEpoch' moved. That epoch is
       *    bumped for FOUR different reasons, and two of them — a depenetration
       *    shove and a teleport — are the artefact, not noise. Judged against
       *    the real bone, the excluded set held drifts up to 0.7594 m while the
       *    kept set held zeros. 'NpcAnimator.lockReason' now says WHY, and only
       *    'base' (a crossfade: the pose is changing, not walking) and 'clamp'
       *    (the delta sanity limit) are excluded — the same class of exclusion
       *    A13 makes. A shove is JUDGED.
       *
       * And a teleport is worse than a shove: 'NpcSystem._unstick' only fires
       * when someone has been pinned inside geometry, which is the blocker this
       * round fixed. Any teleport during the probe FAILS the gate outright.
       *
       * FIX ROUND 3 — IT ONLY EVER LOOKED AT WALKERS, AND THE WORST SKATE IN THE
       * CAMP WAS NOT ON A WALKER.
       *
       * A judge measured ~40 m/min of permanent ground slide on the WORKING
       * NPCs: 'Push_Loop' carries 0.9507 m of support-foot travel per 2.667 s
       * cycle and never lifts a foot, and only GAIT slots drive the body, so the
       * feet slid the whole distance. This gate could not see one metre of it,
       * because 'walkingFeet()' returns walkers only — the artefact lived in
       * state 'work'. Three things changed:
       *
       *  1. it samples 'standingFeet()' — walk, goto, work, idle, errand, talk;
       *  2. a stance window is CLOSED AND JUDGED after WINDOW_MAX seconds even if
       *     the support foot never changes, which on an in-place loop it never
       *     does (the support is whichever toe is lower, and an idle does not
       *     swap them). Without this every stander's window stayed open for the
       *     whole probe and was silently dropped at the end — blind again;
       *  3. the pass now REQUIRES non-walking windows in the sample, so the gate
       *     cannot go quiet about workers a second time, and it reads back the
       *     boot-time cycle-travel bake ('ctx.npcs.loopTravel') to assert every
       *     non-gait loop actually on stage measures in place.
       */
      const unstick0 = S.unstickCount();
      const travel = S.loopTravel || {};
      const GAITS = new Set(['walk', 'walkFormal', 'jog']);
      /**
       * HOW LONG IS A STANDING PERSON'S STANCE WINDOW?
       *
       * A walker's window ends when the foot lifts, which is where the 0.08 m bar
       * was calibrated: half a walk cycle. A STANDING person never lifts that
       * foot, so the window has to be cut somewhere, and the only length that
       * makes the two numbers comparable is the walker's own — anything longer
       * compares a stander's drift over three stances against a bar written for
       * one. So it is taken from the gait bake, not picked: half the measured
       * duration of Walk_Loop (1.3333 s -> 0.667 s).
       */
      const WINDOW_MAX = (S.gaits?.walk?.duration ?? 1.3333) / 2;
      const open = Object.create(null);
      const done = [];
      const shoved = [];
      const travellingClip = new Set();
      const blendSeen = [];
      let hitched = 0, excludedClip = 0, excludedClamp = 0, excludedBlend = 0;
      let prev = performance.now();
      const probe0 = prev;
      /**
       * A DROPPED FRAME IS RELATIVE TO THIS RUN'S OWN CADENCE. A13 calls a 45 ms
       * gap a hitch because it assumes 60 fps; sixteen lanes deep on one GPU
       * every gap is over 45 ms. The bar is 45 ms or 2.5x this run's median,
       * whichever is larger — it still catches the frame that was DROPPED.
       */
      const gaps = [];
      let hitchMs = 45;
      while (performance.now() - probe0 < 22000) {
        const now = performance.now();
        if (gaps.length < 120) {
          gaps.push(now - prev);
          if (gaps.length === 120) {
            const g = gaps.slice().sort((a, b) => a - b);
            hitchMs = Math.max(45, g[60] * 2.5);
          }
        }
        const hitch = now - prev > hitchMs;
        prev = now;
        /**
         * Close a window and file it. Shared by the two ways one ends — the foot
         * comes off the ground (a walker) and WINDOW_MAX elapses (a stander).
         */
        const close = (w) => {
          if (w.n < 3) return;
          const rec = { id: w.id, n: w.n, state: w.state, clip: w.clip,
            gait: GAITS.has(w.clip), secs: +((now - w.t0) / 1000).toFixed(2),
            d: +Math.hypot(w.x1 - w.x0, w.z1 - w.z0).toFixed(4) };
          if (w.blend) blendSeen.push(rec);
          if (w.bad) hitched++;
          else if (w.clipBad) excludedClip++;
          else if (w.clampBad) excludedClamp++;
          else if (w.blend) excludedBlend++;
          else if (w.shoved) shoved.push(rec);
          else done.push(rec);
        };
        for (const f of S.standingFeet()) {
          const key = f.id + ':' + f.name;
          const w = open[key];
          const rx = f.raw.x, rz = f.raw.z;
          // a non-gait loop that travels is skate by construction, wherever the
          // planted foot happens to land — recorded so the verdict names it.
          // A GAIT is meant to travel: the root-motion integrator drives it.
          if (!f.inPlace && !GAITS.has(f.clip)) {
            travellingClip.add(f.id + ':' + f.clip + '@' + f.clipTravel);
          }
          if (f.planted) {
            if (!w) {
              open[key] = { id: f.id, x0: rx, x1: rx, z0: rz, z1: rz, n: 1,
                bad: hitch, clip: f.clip, clipBad: false, clampBad: false,
                epoch: f.epoch, shoved: false, state: f.state, state0: f.state,
                t0: now, blend: f.blending };
            } else {
              w.x0 = Math.min(w.x0, rx); w.x1 = Math.max(w.x1, rx);
              w.z0 = Math.min(w.z0, rz); w.z1 = Math.max(w.z1, rz);
              w.n++;
              if (hitch) w.bad = true;
              if (f.clip !== w.clip) w.clipBad = true;
              if (f.blending) w.blend = true;
              if (f.state !== w.state0) { w.state0 = f.state; w.state += '>' + f.state; }
              if (f.epoch !== w.epoch) {
                w.epoch = f.epoch;
                if (f.reason === 'base') w.clipBad = true;
                else if (f.reason === 'clamp') w.clampBad = true;
                else w.shoved = true;          // 'shift' / 'teleport' — JUDGED
              }
              /**
               * A FOOT THAT NEVER LIFTS STILL HAS TO BE JUDGED. On an in-place
               * loop the support toe never swaps, so the "foot came off the
               * ground" branch below never fires and every worker's window used
               * to be dropped unopened at the end of the probe. Chunk it.
               */
              if (now - w.t0 >= WINDOW_MAX * 1000) {
                close(w);
                open[key] = { id: f.id, x0: rx, x1: rx, z0: rz, z1: rz, n: 1,
                  bad: hitch, clip: f.clip, clipBad: false, clampBad: false,
                  epoch: f.epoch, shoved: false, state: f.state, state0: f.state,
                  t0: now, blend: f.blending };
              }
            }
          } else if (w) {
            close(w);
            open[key] = null;
          }
        }
        await new Promise((r) => requestAnimationFrame(r));
      }

      /**
       * FIX ROUND 4 — THE TURN PHASE. THE SAMPLE ABOVE CANNOT CONTAIN A TURN.
       *
       * A judge filmed THOK turning 3.142 rad to face a player standing behind
       * him with 0.30 m of planted-toe drift per stance window (3.8x this bar),
       * the body origin motionless — the turn itself swept the feet. The probe
       * above could not see it: the player is dropped at (22, 30) and the gate
       * sleeps 6 s before sampling, so every NPC near that point has finished
       * turning before the first window opens.
       *
       * So the player is now walked round BEHIND standing people, one at a time,
       * and each one's stance windows are judged WHILE THEY TURN — same windows,
       * same exclusions, same 0.08 m bar. Two of them turn because the player is
       * standing there ('_look'); a third is spoken to ('talkTo') from behind,
       * which used to snap the yaw in one frame, and the call itself must leave
       * the heading untouched. And one term is new, because the judge measured it
       * and the stance window cannot: a toe that is ON THE GROUND — support or
       * not — may not slide either ('contact' windows: toe within 3 cm of the
       * body's floor, XZ extent, chunked at WINDOW_MAX exactly like a stander's
       * stance window). A turn that pivots about one toe passes the stance
       * window and fails this.
       */
      const wrapA = (a) => { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return a; };
      const CONTACT_H = 0.03;
      const turnSubjects = [];
      const turnWindows = [];
      const contactWindows = [];
      let turnExcluded = 0;
      const used = new Set();
      const pickSubject = () => {
        const c = S.list.filter((n) => !used.has(n.id)
          && (n.state === 'work' || n.state === 'idle' || n.state === 'errand')
          && n.anim.canStep && !n.anim.busy && !n.anim.stepping
          // a beat or a replan due inside the turn would put the body on its
          // knees or on the move half way round — pick someone with time left
          && n.stateT > 4.5 && (n.state !== 'idle' || n.fidgetT > 4.5));
        c.sort((a, b) => b.stateT - a.stateT);
        return c[0] || null;
      };
      const runTurn = async (how) => {
        let n = null;
        for (let k = 0; k < 40 && !n; k++) { n = pickSubject(); if (!n) await sleep(250); }
        if (!n) return null;
        used.add(n.id);
        const g = n.group;
        const behind = { x: g.position.x - Math.sin(g.rotation.y) * 1.6, z: g.position.z - Math.cos(g.rotation.y) * 1.6 };
        p.position.set(behind.x, p.position.y, behind.z);
        p.velocity?.set?.(0, 0, 0);
        p._snapToGround?.();
        const rec = { id: n.id, how, state0: n.state, clip0: n.anim.current, turnedRad: 0,
          maxYawStepRad: 0, syncYawChangeRad: null, steps0: n.anim.stepStats().steps, steps: 0,
          windows: 0, worstM: 0, contactWindows: 0, worstContactM: 0, originMovedM: 0 };
        const o0 = { x: g.position.x, z: g.position.z };
        if (how === 'talk') {
          const y0 = g.rotation.y;
          S.talkTo(n.id);
          rec.syncYawChangeRad = +Math.abs(wrapA(g.rotation.y - y0)).toFixed(4);
        }
        let prevYaw = g.rotation.y;
        const ow = Object.create(null);    // stance windows, keyed by toe
        const cw = Object.create(null);    // contact windows, keyed by toe
        const t0 = performance.now();
        let quiet = 0;
        const closeW = (w, list, key) => {
          if (!w || w.n < 3) return;
          const d = +Math.hypot(w.x1 - w.x0, w.z1 - w.z0).toFixed(4);
          if (w.bad) { turnExcluded++; return; }
          list.push({ id: n.id, how, toe: key, n: w.n, d, clip: w.clip });
        };
        const openW = (f, now) => ({ x0: f.raw.x, x1: f.raw.x, z0: f.raw.z, z1: f.raw.z, n: 1,
          t0: now, epoch: f.epoch, clip: f.clip, bad: f.blending });
        const grow = (w, f, now) => {
          w.x0 = Math.min(w.x0, f.raw.x); w.x1 = Math.max(w.x1, f.raw.x);
          w.z0 = Math.min(w.z0, f.raw.z); w.z1 = Math.max(w.z1, f.raw.z);
          w.n++;
          if (f.blending || f.clip !== w.clip) w.bad = true;
          if (f.epoch !== w.epoch) {
            w.epoch = f.epoch;
            if (f.reason === 'base' || f.reason === 'clamp' || f.reason === 'blend') w.bad = true;
          }
        };
        let prevT = performance.now();
        while (performance.now() - t0 < 6500) {
          await new Promise((r) => requestAnimationFrame(r));
          const now = performance.now();
          const hitch = now - prevT > hitchMs;
          prevT = now;
          const dy = wrapA(g.rotation.y - prevYaw);
          prevYaw = g.rotation.y;
          rec.turnedRad += dy;
          rec.maxYawStepRad = Math.max(rec.maxYawStepRad, Math.abs(dy));
          const gy = g.position.y, sc = g.scale.x || 1;
          for (const f of S.standingFeet()) {
            if (f.id !== n.id) continue;
            // stance window: the planted toe
            let w = ow[f.name];
            if (f.planted) {
              if (!w) ow[f.name] = openW(f, now);
              else {
                grow(w, f, now);
                if (hitch) w.bad = true;
                if (now - w.t0 >= WINDOW_MAX * 1000) { closeW(w, turnWindows, f.name); ow[f.name] = openW(f, now); }
              }
            } else if (w) { closeW(w, turnWindows, f.name); ow[f.name] = null; }
            // contact window: ANY toe on the ground
            let c = cw[f.name];
            const down = f.raw.y - gy < CONTACT_H * sc;
            if (down) {
              if (!c) cw[f.name] = openW(f, now);
              else {
                grow(c, f, now);
                if (hitch) c.bad = true;
                if (now - c.t0 >= WINDOW_MAX * 1000) { closeW(c, contactWindows, f.name); cw[f.name] = openW(f, now); }
              }
            } else if (c) { closeW(c, contactWindows, f.name); cw[f.name] = null; }
          }
          // done once the body has come round and the feet have been put down
          if (Math.abs(rec.turnedRad) > 2.5 && !n.anim.stepping) { if (++quiet > 8) break; } else quiet = 0;
          if (n.state !== 'work' && n.state !== 'idle' && n.state !== 'errand' && n.state !== 'talk' && n.state !== 'face') break;
        }
        for (const k of Object.keys(ow)) closeW(ow[k], turnWindows, k);
        for (const k of Object.keys(cw)) closeW(cw[k], contactWindows, k);
        const mine = turnWindows.filter((w) => w.id === n.id);
        const mineC = contactWindows.filter((w) => w.id === n.id);
        rec.turnedRad = +Math.abs(rec.turnedRad).toFixed(3);
        rec.maxYawStepRad = +rec.maxYawStepRad.toFixed(3);
        rec.steps = n.anim.stepStats().steps - rec.steps0;
        rec.windows = mine.length;
        rec.worstM = mine.length ? Math.max(...mine.map((w) => w.d)) : 0;
        rec.contactWindows = mineC.length;
        rec.worstContactM = mineC.length ? Math.max(...mineC.map((w) => w.d)) : 0;
        rec.originMovedM = +Math.hypot(g.position.x - o0.x, g.position.z - o0.z).toFixed(3);
        rec.state1 = n.state; rec.clip1 = n.anim.current;
        if (how === 'talk') { try { ctx.progression?.closeDialogue?.(); } catch { /* no panel */ } }
        turnSubjects.push(rec);
        return rec;
      };
      for (let attempt = 0; attempt < 6; attempt++) {
        const got = turnSubjects.filter((r) => r.how === 'approach' && r.turnedRad >= 2.5).length;
        if (got >= 2) break;
        await runTurn('approach');
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        if (turnSubjects.some((r) => r.how === 'talk' && r.turnedRad >= 2.5)) break;
        await runTurn('talk');
      }
      const turnedApproach = turnSubjects.filter((r) => r.how === 'approach' && r.turnedRad >= 2.5);
      const turnedTalk = turnSubjects.filter((r) => r.how === 'talk' && r.turnedRad >= 2.5);
      const worstTurn = turnWindows.length ? Math.max(...turnWindows.map((w) => w.d)) : 0;
      const worstContact = contactWindows.length ? Math.max(...contactWindows.map((w) => w.d)) : 0;
      const talkSnap = turnSubjects.filter((r) => r.how === 'talk')
        .reduce((m, r) => Math.max(m, r.syncYawChangeRad ?? 0), 0);
      const turnPass = turnedApproach.length >= 2 && turnedTalk.length >= 1
        && turnWindows.length >= 8 && worstTurn <= 0.08 && worstContact <= 0.08
        && talkSnap === 0;

      const judged = done.concat(shoved);
      const ids = [...new Set(judged.map((w) => w.id))];
      if (judged.length < 10 || ids.length < 3) {
        return { pass: false, detail: { reason: 'too few stance windows to judge',
          judged: judged.length, npcs: ids.length, hitched,
          excludedClip, excludedClamp, hitchThresholdMs: +hitchMs.toFixed(1), turnSubjects } };
      }
      judged.sort((a, b) => b.d - a.d);
      const worst = judged[0].d;
      const median = judged[Math.floor(judged.length / 2)].d;
      const worstShoved = shoved.length
        ? Math.max(...shoved.map((w) => w.d)) : 0;
      const worstClean = done.length ? Math.max(...done.map((w) => w.d)) : 0;
      const unstuck = S.unstickCount() - unstick0;

      /**
       * THE WORKING HALF OF THE SAMPLE, REPORTED ON ITS OWN. A single worst
       * number over a mixed sample can go green on walkers while the workers
       * slide, which is how this gate missed the artefact for two rounds.
       */
      const work = judged.filter((w) => !w.gait);
      const walk = judged.filter((w) => w.gait);
      const workIds = [...new Set(work.map((w) => w.id))];
      const worstWork = work.length ? Math.max(...work.map((w) => w.d)) : 0;
      const worstWalk = walk.length ? Math.max(...walk.map((w) => w.d)) : 0;
      /**
       * Every non-gait loop that was actually on stage, and the bake's verdict on
       * it. A travelling one is skate whatever the windows happened to catch.
       */
      const stagedLoops = [...new Set(judged.filter((w) => !w.gait).map((w) => w.clip))];
      const badLoops = stagedLoops.filter((c) => !(travel[c] && travel[c].speed <= 0.05));

      /**
       * THE CROSSFADES, REPORTED RATHER THAN HIDDEN. These windows are excluded
       * — two clips with different stances put the planted foot in different
       * places, so the foot moves because the ANIMATION moved it, which is the
       * same reason the epoch-'base' exclusion has always existed — but the
       * number is printed here so the exclusion can never be a quiet one, and
       * the counts are checked so it cannot swallow the sample.
       */
      const worstBlend = blendSeen.length ? Math.max(...blendSeen.map((w) => w.d)) : 0;

      return {
        pass: worst <= 0.08 && unstuck === 0
          && (excludedClip + excludedClamp + excludedBlend) < judged.length
          // the blindness itself is a failure: workers/idlers must be in the sample
          && work.length >= 10 && workIds.length >= 2
          && badLoops.length === 0 && travellingClip.size === 0
          // fix round 4: standing people judged WHILE THEY TURN
          && turnPass,
        detail: {
          // fix round 4 — the turn phase (see above): two people turned by the
          // player standing behind them, one by talkTo from behind
          turnPhase: {
            pass: turnPass,
            maxStanceDriftWhileTurningM: +worstTurn.toFixed(4),
            maxGroundContactSlideM: +worstContact.toFixed(4),
            turnWindows: turnWindows.length, contactWindows: contactWindows.length,
            excludedCrossfadeOrHitch: turnExcluded,
            talkToSyncYawChangeRad: talkSnap,
            subjects: turnSubjects,
            worstFive: turnWindows.slice().sort((a, b) => b.d - a.d).slice(0, 5),
            worstFiveContact: contactWindows.slice().sort((a, b) => b.d - a.d).slice(0, 5),
          },
          maxStanceDriftM: worst, medianDriftM: median,
          maxDriftCleanM: +worstClean.toFixed(4),
          maxDriftShovedM: +worstShoved.toFixed(4),
          judgedWindows: judged.length,
          cleanWindows: done.length, shovedWindows: shoved.length,
          npcsSampled: ids.length, npcs: ids,
          // fix round 3 — the working half, which this gate used to not sample
          workWindows: work.length, workNpcs: workIds,
          maxDriftWorkingM: +worstWork.toFixed(4),
          walkWindows: walk.length, maxDriftWalkingM: +worstWalk.toFixed(4),
          nonGaitLoopsOnStage: stagedLoops,
          nonGaitLoopTravel: Object.fromEntries(stagedLoops.map((c) => [c, travel[c]?.speed ?? null])),
          travellingLoopsStaged: [...travellingClip],
          loopsOverInPlaceBar: badLoops,
          windowMaxSeconds: WINDOW_MAX,
          unstickEventsDuringProbe: unstuck,
          unstickTrace: S.unstickTrace(),
          excludedHitched: hitched, excludedClipChange: excludedClip,
          excludedClampedDelta: excludedClamp,
          excludedCrossfade: excludedBlend,
          crossfadeWindows: blendSeen.length,
          maxDriftDuringCrossfadeM: +worstBlend.toFixed(4),
          worstFiveCrossfade: blendSeen.slice().sort((a, b) => b.d - a.d).slice(0, 5),
          hitchThresholdMs: +hitchMs.toFixed(1),
          worstFive: judged.slice(0, 5),
          worstFiveWorking: work.slice(0, 5),
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
        /**
         * IDEMPOTENT, OR IT SUPPRESSES THE THING IT MEASURES (fix round 2).
         *
         * The first cut tore the stage down and re-issued play('walk') on EVERY
         * sample frame. play() clears the foot lock's anchor by design (a base
         * loop change must re-anchor), so the lock skipped its root-motion step
         * on nearly every frame and the bodies barely moved: the same take
         * measured 5.3 m of travel on a loaded box and 2.4 m on a fast one,
         * because the answer depended on how often this callback landed between
         * engine updates rather than on the gait. The guarantee is unchanged —
         * the walk is still the only thing on stage, every frame — it is just
         * no longer rebuilt when it is already true.
         */
        let dirty = n.anim.current !== 'walk';
        for (const [slot, l] of n.anim.slots) {
          if (slot === 'walk') continue;
          if (l.oneShot || l.weight > 0.002) { l.cancel(0); l.setWeight(0); dirty = true; }
        }
        const w = n.anim.slots.get('walk');
        if (dirty) {
          n.anim.current = null;
          n.anim.play('walk', { fade: 0, rate: n.speed });
        }
        if (w && w.weight < 0.999) w.setWeight(1);
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
      // the camp crowd is 180 m from here, so its head look-at is off and the
      // lean measured below is the posture bias and nothing else

      const V = ctx.player.position.constructor;

      /**
       * WRIST CONTINUITY (fix round 1). A judge skinned the body mesh and found
       * a 12.7-25.9 mm hole at every wrist on every build in every pose: the arm
       * loft ended at bind x = 0.712 with no end cap while the hand ellipsoid
       * started at 0.730, so each hand rendered as a pale blob floating clear of
       * the bracer with daylight through the gap. V41's terms — signature,
       * height, knee swing, arm drop, travel, mixer seconds — could not see it.
       *
       * Two numbers close that hole for good, both taken on the SKINNED mesh
       * (SkinnedMesh.applyBoneTransform + localToWorld), per NPC, per side:
       *   overlapM  the forearm-dominant vertices must reach PAST the nearest
       *             hand-dominant vertex along the arm axis — the surfaces
       *             interpenetrate rather than face each other across a gap;
       *   gapM      and the two sets must also touch radially.
       * Measured after the fix: overlap 0.0135-0.40 m, gap at most 0.0087 m.
       */
      const wristTerms = (n) => {
        n.group.updateMatrixWorld(true);
        const mesh = n.mesh, geo = mesh.geometry;
        const pos = geo.attributes.position;
        const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
        const bones = n.skeleton.bones;
        const out = [];
        const v = new V(), a = new V(), b = new V();
        for (const side of ['L', 'R']) {
          const foreRe = new RegExp('forearm.?' + side + '$', 'i');
          const handRe = new RegExp('hand.?' + side + '$', 'i');
          const fore = [], hand = [];
          for (let i = 0; i < pos.count; i++) {
            let bi = -1, bw = -1;
            for (let k = 0; k < 4; k++) {
              const w = sw.getComponent(i, k);
              if (w > bw) { bw = w; bi = si.getComponent(i, k); }
            }
            const nm = bones[bi] ? bones[bi].name : '';
            if (foreRe.test(nm)) fore.push(i);
            else if (handRe.test(nm)) hand.push(i);
          }
          const fb = bones.find((x) => foreRe.test(x.name));
          const hb = bones.find((x) => handRe.test(x.name));
          if (!fore.length || !hand.length || !fb || !hb) {
            out.push({ side, err: 'no skinned wrist vertices' });
            continue;
          }
          a.setFromMatrixPosition(fb.matrixWorld);
          b.setFromMatrixPosition(hb.matrixWorld);
          const ax = b.clone().sub(a).normalize();
          const fw = [], hw = [];
          let foreMax = -1e9, handMin = 1e9;
          for (const i of fore) {
            v.fromBufferAttribute(pos, i); mesh.applyBoneTransform(i, v); mesh.localToWorld(v);
            fw.push(v.clone()); foreMax = Math.max(foreMax, v.clone().sub(a).dot(ax));
          }
          for (const i of hand) {
            v.fromBufferAttribute(pos, i); mesh.applyBoneTransform(i, v); mesh.localToWorld(v);
            hw.push(v.clone()); handMin = Math.min(handMin, v.clone().sub(a).dot(ax));
          }
          let gap = 1e9;
          for (const f of fw) for (const h of hw) { const d = f.distanceTo(h); if (d < gap) gap = d; }
          out.push({ side, overlapM: +(foreMax - handMin).toFixed(4), gapM: +gap.toFixed(4) });
        }
        return out;
      };

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
          n.yOffset = 0;
          // stand them ON the ground every sample. Anything that leaves the
          // body origin off the terrain — a stale sit offset, an update skipped
          // by distance LOD — makes every height and arm measurement below a
          // measurement of that instead (filmed: a 2.57 m "height" on a 1.93 m
          // NPC because its origin was 0.65 m under the meadow).
          n.group.position.y = ctx.terrain.getHeight(n.group.position.x, n.group.position.z);
          if (n.state !== 'goto') { n.state = 'goto'; n.gotoThen = 'idle'; n.leg = null; }
          // aim 30 m straight ahead of where it is NOW: the heading error stays
          // at zero, so the take measures the gait and not the pathfinder
          n.target.set(
            n.group.position.x + Math.sin(n.group.rotation.y) * 30,
            0,
            n.group.position.z + Math.cos(n.group.rotation.y) * 30,
          );
          // unconditionally, every sample: the take must be a walk and nothing
          // else, whatever the behaviour loop wanted to put on stage
          soloWalk(n);

          if (t < total * 0.45) return;      // let the first steps settle
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

      /**
       * POSTURE. The judge measured hips->head lean of 10-34 degrees held
       * permanently on every NPC, bought to clear V35-settlement's pairwise
       * landmark bar on the cheapest available lever. NpcAnimator clamps the
       * combined tilt to LEAN_CAP now, and this measures it on the whole crowd,
       * from the bones, with the player 180 m away so no look-at contributes.
       */
      const spineAxis = (n) => {
        n.group.updateMatrixWorld(true);
        const hips = n.byName.get([...n.byName.keys()].find((k) => /hips$/i.test(k)));
        const head = n.byName.get([...n.byName.keys()].find((k) => /DEF-head$/.test(k)));
        if (!hips || !head) return null;
        const h = new V().setFromMatrixPosition(hips.matrixWorld);
        const d = new V().setFromMatrixPosition(head.matrixWorld).sub(h);
        return d.length() > 1e-4 ? d.normalize() : null;
      };
      /**
       * Measured as the DIFFERENCE the bias makes, not as absolute tilt: half
       * these clips (Fixing_Kneeling, Push_Loop, the sits) lean the spine 50
       * degrees on purpose and always did. Every bone the animator writes
       * procedurally keeps its pure-clip quaternion in its write-back cache, so
       * restoring that cache for one frame gives the clip pose, and the angle
       * between the two hips->head axes is exactly what this lane added.
       */
      const leans = S.list.map((n) => {
        const bias = n.anim._bias;
        const posed = spineAxis(n);
        if (!posed || !bias) return { id: n.id, deg: 0 };
        const armed = bias.map((b) => b.bone.quaternion.clone());
        for (const b of bias) b.bone.quaternion.copy(b.q);
        const clip = spineAxis(n);
        for (let i = 0; i < bias.length; i++) bias[i].bone.quaternion.copy(armed[i]);
        n.group.updateMatrixWorld(true);
        if (!clip) return { id: n.id, deg: 0 };
        const deg = Math.acos(Math.max(-1, Math.min(1, posed.dot(clip)))) * 57.2958;
        return { id: n.id, deg: +deg.toFixed(1), reported: +(n.anim.leanRad * 57.2958).toFixed(1) };
      });
      const maxLean = Math.max(...leans.map((l) => l.deg));

      const wrists = S.list.map((n) => ({ id: n.id, build: n.body, terms: wristTerms(n) }));
      const wristRows = wrists.flatMap((w) => w.terms.map((t) => ({ id: w.id, ...t })));
      const badWrists = wristRows.filter((r) => r.err || !(r.overlapM > 0) || !(r.gapM <= 0.02));

      const armDrop = dropSum.map((v, i) => +(dropN[i] ? v / dropN[i] : 0).toFixed(3));
      pair.forEach((n, i) => { kneeRange[i] = +(kneeMax[i] - kneeMin[i]).toFixed(3); });
      const travelled = pair.map((n, i) => +Math.hypot(
        n.group.position.x - start[i].x, n.group.position.z - start[i].z).toFixed(2));
      const mixerRan = pair.map((n, i) => +(n.anim.mixer.time - start[i].m).toFixed(2));

      // Height measured HEAD-TO-FOOT, not head-to-origin: the only definition
      // that cannot be wrong about where the body actually is.
      const heights = pair.map((n) => {
        n.group.updateMatrixWorld(true);
        const head = bone(n, /DEF-head$/);
        const fl = bone(n, /foot.?L$/i), fr = bone(n, /foot.?R$/i);
        if (!head || !fl || !fr) return 0;
        const sole = Math.min(fl.matrixWorld.elements[13], fr.matrixWorld.elements[13]) - 0.10;
        return +(head.matrixWorld.elements[13] - sole + 0.19).toFixed(3);
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
        maxProceduralLeanDeg: maxLean,
        leanPerNpc: leans,
        wristWorstOverlapM: Math.min(...wristRows.map((r) => (r.overlapM ?? -9))),
        wristWorstGapM: Math.max(...wristRows.map((r) => (r.gapM ?? 9))),
        wristFailures: badWrists,
        wristRows,
      };
      const pass = pair[0].body !== pair[1].body
        && S.signature(pair[0]) !== S.signature(pair[1])
        && Math.abs(heights[0] - heights[1]) >= 0.05
        && kneeRange.every((k) => k >= 0.5)
        && armDrop.every((m) => m >= 0.25)
        && travelled.every((t) => t >= 2.5)
        && mixerRan.every((m) => m >= 5)
        && badWrists.length === 0
        && maxLean <= 12;
      return { pass, detail };
    })()`,
  },
];
