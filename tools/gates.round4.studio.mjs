/**
 * Round 4 gates — lane `studio` (docs/ROUND4-AUDIT.md §4 "studio").
 *
 * Same contract as tools/gates.config.mjs: ACTION gates resolve
 * { pass, detail } in page context with __CTX__/__GAME__ available; VISUAL
 * gates capture a deterministic screenshot judged against `criteria`.
 *
 * GATE IDS. `A78-` and `A79-` numbers are shared with other lanes' suffixes
 * (`A78-loop-reclaim`, `A79-runner-verdict-line` in gates.config.mjs); the
 * runner keys on the FULL id, and `A78-cast-states` / `A79-time-authority` are
 * the ids §4 assigns this lane, so they are registered verbatim. No other
 * lane's gate is touched.
 *
 * TIMING. Headless Chrome renders this valley at ~20 fps on a shared box, so
 * sim time runs at roughly 0.85x wall — and the FIRST frame after
 * `studio.enter()` compiles the photo pass' shader, which alone eats several
 * hundred milliseconds of sim. Everything timed below therefore counts
 * `engine.simTime`, with a wall-clock cap so a genuinely frozen page still
 * ends the gate, and every scenario settles after entering before it measures.
 */

/** Sim clock + a sleep measured in SIM seconds (wall-capped). */
const SIMCLOCK = `
  const simNow = () => (__CTX__.engine ? __CTX__.engine.simTime : performance.now() / 1000);
  async function simSleep(s, each, capX = 6) {
    const t0 = simNow(), w0 = performance.now();
    while (simNow() - t0 < s && performance.now() - w0 < s * 1000 * capX + 6000) {
      await new Promise(r => setTimeout(r, 50));
      if (each) each(simNow() - t0);
    }
    return simNow() - t0;
  }
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
`;

/** Freeze every machine except the ones in `keep` so nothing wanders into shot. */
const FREEZE = `function freezeAll(keep) {
  const set = new Set(keep || []);
  for (const m of __CTX__.machines.list) {
    if (set.has(m)) continue;
    if (!m._frozenByGate) { m._frozenByGate = m.update; m.update = () => {}; }
  }
}`;

/** Park a machine: calm, no route travel, heading held. The "calm" of A78. */
const PARK = `function park(m, heading) {
  m.route = [m.position.clone()];
  m._wpIndex = 0;
  m._waitT = 1e6;
  if (heading !== undefined) m.heading = heading;
  m.suspicion = 0;
  m._unseenT = 99;
  m.ai.search.stop();
  m.ai.engage.reset();
  m.setState('patrol');
}`;

/**
 * Open photo mode the way a photographer does — the F10 key, not the method —
 * and let the pass' shader compile before anything is measured.
 */
const ENTER = `async function enterStudio() {
  // dispatch on the BODY so the event really propagates (window capture ->
  // document -> target -> bubble), the way a keypress does. Dispatching
  // straight at window puts every listener in the target phase, where
  // registration order wins and capture buys nothing — which would hide the
  // very bug A79b exists to catch.
  document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'F10', bubbles: true }));
  await sleep(200);
  if (__CTX__.state !== 'studio') __CTX__.studio.enter();
  await sleep(900);            // photo-pass shader compile + first frames
  return __CTX__.state === 'studio';
}`;

export const GATES = [
  /* ------------------------------------------------------------------ A78 */
  {
    id: 'A78-cast-states', kind: 'action', lane: 'studio',
    title: 'Cast panel Attack button on a CALM machine 80 m from Aloy: still `attack` a full sim second later, held by the director',
    setup: `(async () => { __CTX__.input.enabled = true; })()`,
    settle: 600, timeout: 90000,
    assert: `(async () => {
      ${SIMCLOCK} ${FREEZE} ${PARK} ${ENTER}
      const ctx = __CTX__;
      const S = ctx.studio;
      if (!S) return { pass: false, detail: 'no ctx.studio' };

      // --- stage: one living machine, parked calm, 80 m from Aloy so nothing
      //     it can legitimately perceive could put it in attack by itself.
      const m = ctx.machines.list.find((x) => x.alive && typeof x.forceState === 'function');
      if (!m) return { pass: null, detail: 'SKIP: no living machine with forceState' };
      freezeAll([m]);
      const p = ctx.player;
      m.position.set(p.position.x + 80, ctx.terrain.getHeight(p.position.x + 80, p.position.z), p.position.z);
      m.spawnPos.set(m.position.x, m.spawnPos.y, m.position.z);
      park(m, Math.PI);            // facing away from her
      await sleep(250);
      const calm = m.state;
      if (calm === 'attack') return { pass: false, detail: 'staging failed: machine was already attacking' };

      if (!(await enterStudio())) return { pass: false, detail: 'F10 did not open photo mode (state=' + ctx.state + ')' };

      // --- act: through the PANEL, not the API. Open Cast, lock the target,
      //     click the button labelled Attack.
      S._ui.querySelector('#st-cast').click();
      S.cast.setTarget(m);
      S.cast.locked = true;
      const btn = S._ui.querySelector('#st-cast-states button[data-state="attack"]');
      if (!btn) return { pass: false, detail: 'cast panel has no Attack button' };
      btn.click();
      const t0 = m.state;
      const onPress = btn.classList.contains('on');

      // --- measure: one full SIM second of the world actually running.
      const seen = new Set();
      let bad = 0, n = 0;
      const elapsed = await simSleep(1.0, () => {
        seen.add(m.state); n++;
        if (m.state !== 'attack') bad++;
      });

      const d = S.debug();
      const hold = d.cast.hold;
      const detail = 'calm=' + calm + ' -> click -> ' + t0
        + ' | ' + elapsed.toFixed(2) + 's sim, ' + n + ' samples, states={' + [...seen].join(',') + '}'
        + ' | hold=' + (hold ? hold.state + ' ' + hold.held.toFixed(2) + 's reforced=' + hold.reforced : 'NONE')
        + ' | btn.on=' + onPress + ' | engineTs=' + d.engineTimeScale;

      if (elapsed < 0.9) return { pass: false, detail: 'sim never advanced a second (' + elapsed.toFixed(2) + 's) — ' + detail };
      if (t0 !== 'attack') return { pass: false, detail: 'button did not take effect at all — ' + detail };
      if (bad) return { pass: false, detail: 'drifted out of attack on ' + bad + '/' + n + ' samples — ' + detail };
      if (!hold || hold.state !== 'attack') return { pass: false, detail: 'no hold registered — ' + detail };
      if (!onPress) return { pass: false, detail: 'panel did not light the pressed state — ' + detail };

      // --- and the release hands it back to its own AI, so a held state is a
      //     loan, not a lobotomy.
      S._ui.querySelector('#st-cast-release').click();
      const released = !S.debug().cast.hold;
      S.exit();
      if (!released) return { pass: false, detail: 'Release hold left the hold standing — ' + detail };

      return { pass: true, detail };
    })()`,
  },

  /* ----------------------------------------------------------------- A78b */
  {
    id: 'A78b-cast-pose-set', kind: 'action', lane: 'studio',
    title: 'Every cast state and every Aloy pose the panels offer is accepted: sustained states hold, one-shots resolve, a hit/death is filmable from `studio`',
    setup: `(async () => { __CTX__.input.enabled = true; })()`,
    settle: 600, timeout: 120000,
    assert: `(async () => {
      ${SIMCLOCK} ${FREEZE} ${PARK} ${ENTER}
      const ctx = __CTX__, S = ctx.studio;
      if (!S) return { pass: false, detail: 'no ctx.studio' };
      if (!(await enterStudio())) return { pass: false, detail: 'F10 did not open photo mode' };

      /* ---- 1. every sustained cast state actually sticks -------------- */
      const stateBtns = [...S._ui.querySelectorAll('#st-cast-states button')];
      if (stateBtns.length < 9) return { pass: false, detail: 'cast panel offers only ' + stateBtns.length + ' states' };
      const sustained = ['patrol', 'suspicious', 'alert', 'search', 'attack'];
      const stateLog = [];
      for (const id of sustained) {
        const m = ctx.machines.list.find((x) => x.alive && x.kind !== 'glinthawk' && typeof x.forceState === 'function');
        if (!m) { stateLog.push(id + ':SKIP'); continue; }
        freezeAll([m]);
        park(m);
        S.cast.setTarget(m); S.cast.locked = true;
        stateBtns.find((b) => b.dataset.state === id).click();
        await simSleep(0.35);
        stateLog.push(id + ':' + m.state);
        S.cast.release();
      }
      const stateBad = stateLog.filter((s) => !s.endsWith(':SKIP') && s.split(':')[0] !== s.split(':')[1]);

      /* ---- 2. the transient poses reach their real owners ------------- */
      const poseLog = [];
      const victim = ctx.machines.list.find((x) => x.alive && typeof x.forceState === 'function');
      if (victim) {
        freezeAll([victim]); park(victim);
        S.cast.setTarget(victim); S.cast.locked = true;
        stateBtns.find((b) => b.dataset.state === 'stagger').click();
        await simSleep(0.2);
        poseLog.push('stagger->' + victim.state);
        stateBtns.find((b) => b.dataset.state === 'dead').click();
        await simSleep(0.4);
        poseLog.push('dead->' + victim.state + ' alive=' + victim.alive);
      }
      const deathOk = !victim || (victim.state === 'dead' && !victim.alive);

      /* ---- 3. player-anim-17: a HIT is filmable from studio ----------- */
      const p = ctx.player;
      const hp0 = p.health;
      const poseBtns = [...S._ui.querySelectorAll('#st-poses button')];
      if (poseBtns.length < 10) return { pass: false, detail: 'Aloy panel offers only ' + poseBtns.length + ' poses' };
      poseBtns.find((b) => b.dataset.pose === 'hitStagger').click();
      await simSleep(0.25);
      const hitTook = p.health < hp0;
      const hitSlot = S.debug().pose.hitSlot;
      const stateKept = ctx.state;

      /* ---- 4. ... and so is a DEATH, held past the respawn timer ------
       * Player._die() schedules a 3.2 s WALL-CLOCK setTimeout that heals
       * her, TELEPORTS her to CAMP_POS and sets 'playing'. So the death pose
       * has to be measured on the far side of that timer or the gate is just
       * asking whether it happened to have fired yet: the first cut of this
       * gate slept 0.5 s, passed twice and failed once on identical code, and
       * the bug it was missing was the subject being yanked across the valley
       * three seconds into every death shot.
       */
      const deathPos = p.position.clone();
      poseBtns.find((b) => b.dataset.pose === 'death').click();
      await sleep(600);
      const diedTo = ctx.state;                 // studio takes 'dead' back at once
      const died = p.health <= 0 || diedTo === 'studio' || diedTo === 'dead';
      await sleep(3600);                        // WALL seconds, past the 3200 ms respawn
      const heldState = ctx.state;
      const teleportedM = p.position.distanceTo(deathPos);
      const stillDown = p.health <= 0;

      /* ---- 5. jump / roll / crouch are not refused -------------------- */
      const refusals = [];
      for (const id of ['roll', 'jump', 'land', 'pickup', 'interact', 'crouch', 'idle']) {
        const r = S.playPose(id);
        if (!r.ok) refusals.push(id + '(' + r.detail + ')');
        await sleep(60);
      }
      S.exit();

      const detail = 'states[' + stateLog.join(' ') + '] poses[' + poseLog.join(' ') + ']'
        + ' hitTookDamage=' + hitTook + ' hitSlot=' + hitSlot + ' stateDuringHit=' + stateKept
        + ' deathFilmed=' + died + ' stateAfterRespawnWindow=' + heldState
        + ' subjectMoved=' + teleportedM.toFixed(2) + 'm stillDown=' + stillDown
        + ' exitState=' + ctx.state + ' healedOnExit=' + (p.health > 0)
        + (refusals.length ? ' REFUSED=' + refusals.join(',') : ' allPosesAccepted');

      if (stateBad.length) return { pass: false, detail: 'cast states did not stick: ' + stateBad.join(',') + ' — ' + detail };
      if (!deathOk) return { pass: false, detail: 'Death button left the machine alive — ' + detail };
      if (!hitTook) return { pass: false, detail: 'takeDamage still refused in studio state (player-anim-17) — ' + detail };
      if (hitSlot !== 'hitChest' && hitSlot !== 'hitHead') return { pass: false, detail: 'no hit-react layer started — ' + detail };
      if (!died) return { pass: false, detail: 'death pose did nothing — ' + detail };
      if (heldState !== 'studio') return { pass: false, detail: 'the respawn timer took the world off the studio mid-shoot (state=' + heldState + ') — ' + detail };
      if (teleportedM > 0.6) return { pass: false, detail: 'the subject was teleported ' + teleportedM.toFixed(1) + ' m out of frame by the respawn — ' + detail };
      if (!stillDown) return { pass: false, detail: 'the death would not hold: she was healed out of the pose mid-shoot — ' + detail };
      if (ctx.state !== 'playing') return { pass: false, detail: 'exit did not restore playing — ' + detail };
      if (p.health <= 0) return { pass: false, detail: 'exit handed back a live world with a dead Aloy in it — ' + detail };
      if (refusals.length) return { pass: false, detail: 'poses refused — ' + detail };
      return { pass: true, detail };
    })()`,
  },

  /* ------------------------------------------------------------------ A79 */
  {
    id: 'A79-time-authority', kind: 'action', lane: 'studio',
    title: 'Studio freeze while combat is live: engine.timeScale === 0 and simTime is still for 2 s, with hitstop/concentration/legacy all shouting a different number every poll',
    setup: `(async () => { __CTX__.input.enabled = true; })()`,
    settle: 600, timeout: 90000,
    assert: `(async () => {
      ${SIMCLOCK} ${FREEZE} ${PARK} ${ENTER}
      const ctx = __CTX__, S = ctx.studio, e = ctx.engine;
      if (!S) return { pass: false, detail: 'no ctx.studio' };
      if (typeof e.requestTimeScale !== 'function') return { pass: false, detail: 'engine has no requestTimeScale authority' };

      // --- stage REAL combat: a machine is attacking Aloy, and the combat
      //     system has a live hitstop on the books when the studio opens.
      const m = ctx.machines.list.find((x) => x.alive && typeof x.forceState === 'function');
      if (m) {
        freezeAll([m]);
        const p = ctx.player;
        m.position.set(p.position.x + 11, ctx.terrain.getHeight(p.position.x + 11, p.position.z), p.position.z);
        m.spawnPos.set(m.position.x, m.spawnPos.y, m.position.z);
        m.forceState('attack');
      }
      ctx.combat?._startHitstop?.(0.9);
      await sleep(120);
      const before = e.timeScaleSources();
      const rivalsBefore = Object.keys(before).filter((k) => k !== 'studio');

      if (!(await enterStudio())) return { pass: false, detail: 'F10 did not open photo mode' };

      // --- freeze through the PANEL slider, the way a photographer does.
      const slider = S._ui.querySelector('#st-time');
      slider.value = '0';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      if (S.timeScale !== 0) return { pass: false, detail: 'Time slider did not reach 0 (studio.timeScale=' + S.timeScale + ')' };

      // --- 2 WALL seconds (the gate names wall seconds: a frozen world has no
      //     sim seconds to count), with three rival owners re-asserting a
      //     DIFFERENT scale on every single poll — exactly what combat, the
      //     wheel and the legacy setter do every frame.
      const t0 = performance.now();
      const sim0 = e.simTime;
      const samples = [];
      let worst = 0, polls = 0;
      const sourcesSeen = new Set();
      while (performance.now() - t0 < 2000) {
        e.requestTimeScale('hitstop', 0.03);
        e.requestTimeScale('concentration', 0.35);
        e.timeScale = 0.5;                      // legacy direct write
        await sleep(40);
        const ts = e.timeScale;
        polls++;
        if (ts !== 0) { worst = Math.max(worst, Math.abs(ts)); samples.push(ts); }
        for (const k of Object.keys(e.timeScaleSources())) sourcesSeen.add(k);
      }
      const simDrift = e.simTime - sim0;
      const wall = (performance.now() - t0) / 1000;

      // --- release the rivals and leave: the studio must hand time back.
      e.requestTimeScale('hitstop', null);
      e.requestTimeScale('concentration', null);
      S.exit();
      await sleep(200);
      const after = e.timeScale;
      const afterSources = e.timeScaleSources();

      const detail = 'rivalsAtEntry=[' + rivalsBefore.join(',') + '] contested=[' + [...sourcesSeen].join(',') + ']'
        + ' | ' + polls + ' polls over ' + wall.toFixed(2) + 's wall, non-zero=' + samples.length
        + ' worst=' + worst + ' simDrift=' + simDrift.toFixed(4) + 's'
        + ' | afterExit ts=' + after + ' sources=' + JSON.stringify(afterSources);

      if (polls < 20) return { pass: false, detail: 'only ' + polls + ' polls — the page stalled, not a real 2 s — ' + detail };
      if (sourcesSeen.size < 3) return { pass: false, detail: 'the freeze was never actually contested — ' + detail };
      if (samples.length) return { pass: false, detail: 'timeScale left 0 on ' + samples.length + ' polls — ' + detail };
      if (Math.abs(simDrift) > 1e-6) return { pass: false, detail: 'world kept simulating while frozen (' + simDrift.toFixed(4) + 's) — ' + detail };
      if (after !== 1) return { pass: false, detail: 'exit did not hand time back (ts=' + after + ') — ' + detail };
      if ('studio' in afterSources) return { pass: false, detail: 'studio never released its claim — ' + detail };
      return { pass: true, detail };
    })()`,
  },

  /* ----------------------------------------------------------------- A79b */
  {
    id: 'A79b-studio-shell', kind: 'action', lane: 'studio',
    title: 'F10 from the pause menu closes the pause overlay, takes input, sits above every HUD layer, flies on REAL dt while frozen, and Esc restores playing',
    setup: `(async () => { __CTX__.input.enabled = true; })()`,
    settle: 600, timeout: 90000,
    assert: `(async () => {
      ${SIMCLOCK} ${ENTER}
      const ctx = __CTX__, S = ctx.studio;
      if (!S) return { pass: false, detail: 'no ctx.studio' };

      /* ---- 1. enter FROM the pause menu ------------------------------- */
      ctx.state = 'paused';
      ctx.hud?.setPaused?.(true);
      await sleep(200);
      if (!(await enterStudio())) return { pass: false, detail: 'F10 refused from the pause menu (state=' + ctx.state + ')' };
      const pauseEl = document.getElementById('pause');
      const pauseVisible = !!pauseEl && pauseEl.classList.contains('show');
      const prevState = S.debug().prevState;
      const inputOff = ctx.input.enabled === false;

      /* ---- 2. z-order: nothing another lane owns can steal a click ----
       * NOT a hard-coded selector list. Other lanes build their chrome at
       * runtime (#hzc-wheel, #hzc-menus, #hzc-inv, #perf-stats are nowhere in
       * index.html), so a fixed list quietly checked nothing but #hud — and an
       * overlay landing at z 99999 shipped green under it. Scan the WHOLE
       * document: anything outside the studio's OWN three roots that claims a
       * stacking order at or above it AND can take a pointer is a layer that
       * can eat the cast buttons.
       */
      const ownIds = ['studio-ui', 'studio-guides', 'studio-hint'];
      const ownEls = ownIds.map((id) => document.getElementById(id)).filter(Boolean);
      const isOwn = (el) => ownEls.some((r) => r === el || r.contains(el));
      const studioEl = document.getElementById('studio-ui');
      const zStudio = studioEl ? parseInt(getComputedStyle(studioEl).zIndex, 10) : NaN;
      const stacked = [];
      for (const el of document.querySelectorAll('body *')) {
        if (isOwn(el)) continue;
        const cs = getComputedStyle(el);
        const z = parseInt(cs.zIndex, 10);
        if (Number.isFinite(z)) {
          stacked.push([(el.id || el.tagName.toLowerCase() + '.' + (el.className || '?')) + (cs.pointerEvents === 'none' ? '/pe-none' : ''), z, cs.pointerEvents]);
        }
      }
      stacked.sort((a, b) => b[1] - a[1]);
      const others = Object.fromEntries(stacked.slice(0, 6).map(([n, z]) => [n, z]));
      const over = stacked.filter(([, z, pe]) => Number.isFinite(zStudio) && z >= zStudio && pe !== 'none');
      if (stacked.length < 4) return { pass: false, detail: 'z-order scan found only ' + stacked.length + ' stacked elements — the scan is broken, not the build' };

      /* ---- 3. the lens flies on REAL seconds with the world at 0 ------ */
      S.setTimeScale(0);
      await sleep(200);
      const sim0 = ctx.engine.simTime;
      const p0 = ctx.camera.position.clone();
      S._keys.add('KeyW');
      const w0 = performance.now();
      await sleep(900);
      S._keys.delete('KeyW');
      const flew = ctx.camera.position.distanceTo(p0);
      const realWall = (performance.now() - w0) / 1000;
      const simDrift = ctx.engine.simTime - sim0;
      /*
       * 14 m/s nominal. The lens flies on WALL seconds, so with the world
       * frozen it must cover ~14 * realWall regardless of how slowly this box
       * renders.
       *
       * The band was `> expect * 0.33`, which is not a real-dt assertion at
       * all — it passes a lens flying at a THIRD of true speed. It duly went
       * green at 4.90 m against 12.6 m due, hiding a lossy per-frame dt clamp
       * that discarded every millisecond past 50 ms (so the fly cam slowed
       * down in lockstep with the frame rate under 20 fps).
       *
       * Both ends are now checked, ±1 rendered frame of slack: the key is
       * added and removed between frames, so the first frame's dt can reach
       * back before the press and the last partial frame is never counted.
       */
      const expect = 14 * realWall;
      const frameSlack = 1.6 / Math.max(4, S.debug().fps || 8) / Math.max(0.2, realWall);
      const loBand = Math.max(0.45, 0.9 - frameSlack);
      const hiBand = 1.15 + frameSlack;

      /* ---- 4. hide-Aloy hides her; Hide HUD hides ALL foreign chrome --
       * not just the id #hud: whatever is left rendered above the canvas is in the
       * photograph. #perf-stats (z 99999, another lane's) is the one that made
       * this literal.
       */
      S._ui.querySelector('#st-hide-aloy').click();
      await sleep(120);
      const hidden = ctx.player.model.visible === false;
      S._ui.querySelector('#st-hud').click();
      await sleep(90);
      const hudHidden = document.getElementById('hud')?.classList.contains('studio-hidden');
      // every chrome root — every body child that is not studio chrome and does
      // not hold the canvas — must now be gone from the frame.
      const canvas = ctx.renderer.domElement;
      const stillPainting = [];
      for (const el of document.body.children) {
        if (isOwn(el) || el.contains(canvas)) continue;
        const tag = el.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'TEMPLATE') continue;
        if (!el.classList.contains('studio-hidden')) {
          stillPainting.push((el.id || tag.toLowerCase() + '.' + el.className) + ' z=' + getComputedStyle(el).zIndex);
        }
      }

      /* ---- 5. Esc leaves, and leaves nothing behind ------------------- */
      document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
      await sleep(250);
      const restored = {
        state: ctx.state,
        input: ctx.input.enabled,
        aloy: ctx.player.model.visible,
        hud: !document.getElementById('hud')?.classList.contains('studio-hidden'),
        ui: document.getElementById('studio-ui').classList.contains('hidden'),
        ts: ctx.engine.timeScale,
        fov: ctx.camera.fov,
      };

      const detail = 'pauseOverlayLeftUp=' + pauseVisible + ' prevState=' + prevState + ' inputTaken=' + inputOff
        + ' | zStudio=' + zStudio + ' vs top ' + stacked.length + ' stacked: ' + JSON.stringify(others)
        + ' | flew=' + flew.toFixed(2) + 'm in ' + realWall.toFixed(2) + 's wall (expect ~' + expect.toFixed(1) + 'm) simDrift=' + simDrift.toFixed(4)
        + ' | hidAloy=' + hidden + ' hidHud=' + !!hudHidden
        + ' chromeRootsHidden=' + S.debug().chromeRoots
        + (stillPainting.length ? ' STILL-PAINTING=' + stillPainting.join(',') : ' allChromeHidden')
        + ' | afterEsc=' + JSON.stringify(restored);

      if (pauseVisible) return { pass: false, detail: 'pause overlay still painted across the shot — ' + detail };
      if (prevState !== 'playing') return { pass: false, detail: 'entering from pause left prevState=' + prevState + ' (Esc would drop into a frozen game) — ' + detail };
      if (!inputOff) return { pass: false, detail: 'studio did not take input — Aloy answers the fly keys — ' + detail };
      if (!Number.isFinite(zStudio)) return { pass: false, detail: 'studio panel has no stacking context — ' + detail };
      if (over.length) return { pass: false, detail: 'these clickable layers sit at or above the studio: ' + JSON.stringify(over) + ' — ' + detail };
      if (stillPainting.length) return { pass: false, detail: 'Hide HUD left foreign chrome in the frame: ' + stillPainting.join(',') + ' — ' + detail };
      if (Math.abs(simDrift) > 1e-6) return { pass: false, detail: 'world simulated while frozen — ' + detail };
      if (flew < expect * 0.33) return { pass: false, detail: 'lens barely moved with the world frozen — the fly cam is not on real dt — ' + detail };
      if (!hidden) return { pass: false, detail: 'Hide Aloy did not hide her — ' + detail };
      if (!hudHidden) return { pass: false, detail: 'Hide HUD did not hide the HUD — ' + detail };
      if (restored.state !== 'playing') return { pass: false, detail: 'Esc did not restore playing — ' + detail };
      if (restored.input !== true) return { pass: false, detail: 'Esc did not give input back — ' + detail };
      if (restored.aloy !== true) return { pass: false, detail: 'Esc left Aloy hidden — ' + detail };
      if (!restored.hud) return { pass: false, detail: 'Esc left the HUD hidden — ' + detail };
      if (!restored.ui) return { pass: false, detail: 'Esc left the studio panels on screen — ' + detail };
      if (restored.ts !== 1) return { pass: false, detail: 'Esc left time scaled — ' + detail };
      return { pass: true, detail };
    })()`,
  },

  /* ----------------------------------------------------------------- A79c */
  {
    id: 'A79c-lens-stack', kind: 'action', lane: 'studio',
    title: 'Photo pass is free until asked for: DoF / filter / frame / grain / vignette each switch the pass on, auto-focus lands on Aloy\'s head, and the pass is off again on exit',
    setup: `(async () => { __CTX__.input.enabled = true; })()`,
    settle: 600, timeout: 90000,
    assert: `(async () => {
      ${SIMCLOCK} ${ENTER}
      const ctx = __CTX__, S = ctx.studio;
      if (!S) return { pass: false, detail: 'no ctx.studio' };
      const passBefore = !!S.pass;
      if (!(await enterStudio())) return { pass: false, detail: 'F10 did not open photo mode' };
      if (!S.pass) return { pass: null, detail: 'SKIP: composer unavailable, no photo pass built' };
      const idle = S.pass.enabled;             // nothing asked for yet

      const u = S.pass.uniforms;
      const log = [];
      const trip = async (label, fn, read) => {
        fn();
        await sleep(180);
        log.push(label + '=' + (S.pass.enabled ? 'ON' : 'off') + '(' + read() + ')');
        return S.pass.enabled;
      };

      // frame Aloy so auto-focus has a subject
      const p = ctx.player;
      S._pos.set(p.position.x + Math.sin(p.heading) * 2.6, p.position.y + 1.45, p.position.z + Math.cos(p.heading) * 2.6);
      S._yaw = p.heading; S._pitch = -0.02;
      await sleep(200);

      const dofOn = await trip('dof', () => { S._ui.querySelector('#st-dof').click(); }, () => 'r=' + u.uMaxRadius.value.toFixed(1));
      // auto-focus must land on her HEAD, not on the ground at her feet
      const headY = S.pose.animator?.b?.head?.bone ? S.pose.animator.b.head.bone.getWorldPosition(new (ctx.camera.position.constructor)()).y : null;
      const focus = S.lens.focus;
      const camY = ctx.camera.position.y;
      S._ui.querySelector('#st-dof').click();   // off again
      await sleep(120);

      const filterOn = await trip('filter', () => { S._ui.querySelector('#st-filters button[data-filter="noir"]').click(); }, () => 'f=' + u.uFilter.value);
      S._ui.querySelector('#st-filters button[data-filter="none"]').click();
      await sleep(120);

      const frameOn = await trip('frame', () => { S._ui.querySelector('#st-frames button[data-frame="wide"]').click(); }, () => 'a=' + u.uFrameAspect.value.toFixed(2));
      S._ui.querySelector('#st-frames button[data-frame="full"]').click();
      await sleep(120);

      const grainOn = await trip('grain', () => {
        const el = S._ui.querySelector('#st-grain'); el.value = '0.4';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, () => 'g=' + u.uGrain.value.toFixed(2));
      const vigOn = await trip('vignette', () => {
        const el = S._ui.querySelector('#st-grain'); el.value = '0';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        const v = S._ui.querySelector('#st-vig'); v.value = '0.6';
        v.dispatchEvent(new Event('input', { bubbles: true }));
      }, () => 'v=' + u.uVignette.value.toFixed(2));

      const filters = [...S._ui.querySelectorAll('#st-filters button')].length;
      const frames = [...S._ui.querySelectorAll('#st-frames button')].length;

      S.exit();
      await sleep(200);
      const offAfter = S.pass.enabled === false;

      const detail = 'builtBeforeEnter=' + passBefore + ' idleAfterEnter=' + idle
        + ' | ' + log.join(' ') + ' | filters=' + filters + ' frames=' + frames
        + ' | autofocus=' + focus.toFixed(2) + 'm camY=' + camY.toFixed(2) + ' headY=' + (headY === null ? 'n/a' : headY.toFixed(2))
        + ' | passOffAfterExit=' + offAfter;

      if (passBefore) return { pass: false, detail: 'photo pass was built before the studio was ever opened — gameplay pays for it — ' + detail };
      if (idle) return { pass: false, detail: 'pass is enabled with no effect asked for — ' + detail };
      if (!dofOn) return { pass: false, detail: 'Depth of field did not arm the pass — ' + detail };
      if (!filterOn) return { pass: false, detail: 'a film filter did not arm the pass — ' + detail };
      if (!frameOn) return { pass: false, detail: 'a 2.39 frame did not arm the pass — ' + detail };
      if (!grainOn) return { pass: false, detail: 'grain did not arm the pass — ' + detail };
      if (!vigOn) return { pass: false, detail: 'vignette did not arm the pass — ' + detail };
      if (filters < 6) return { pass: false, detail: 'only ' + filters + ' filters — ' + detail };
      if (frames < 6) return { pass: false, detail: 'only ' + frames + ' frames — ' + detail };
      if (!(focus > 1.4 && focus < 4.5)) return { pass: false, detail: 'auto-focus did not land on the subject 2.6 m away — ' + detail };
      if (headY !== null && Math.abs(headY - camY) > 0.8) return { pass: false, detail: 'auto-focus subject is not head height — ' + detail };
      if (!offAfter) return { pass: false, detail: 'pass still enabled after exit — gameplay pays for it — ' + detail };
      return { pass: true, detail };
    })()`,
  },

  /* ------------------------------------------------------------------ V79
   * `setup` + `settle`, NOT `eval` + `wait`. The runner (tools/gates.mjs) reads
   * exactly `setup` and `settle` on a visual gate and nothing else — a gate
   * written with `eval`/`wait` is loaded, listed, screenshotted and reported as
   * NEEDS-JUDGE having executed none of its own staging. That is how this gate
   * shipped a plain third-person gameplay frame, HUD and all, under a title
   * claiming a 2.39 portrait. A79d below now fails on the field name itself.
   */
  {
    id: 'V79-photo-portrait', kind: 'visual', lane: 'studio',
    title: 'Photo mode portrait: Aloy meeting the lens, shallow depth of field, 2.39 bars, warm grade, no HUD and no panels',
    settle: 1400,
    setup: `(async () => {
      const ctx = __CTX__, S = ctx.studio;
      if (!S.enter()) throw new Error('studio refused to open from state ' + ctx.state);
      await new Promise(r => setTimeout(r, 900));
      const p = ctx.player;
      // three-quarter front: the lens 2.6 m ahead of her and 25 deg off her
      // shoulder line, so the portrait has a cheekbone in it and not a flat
      // passport frame. Camera forward for yaw y is (-sin y, 0, -cos y), so the
      // yaw that looks back at her from an offset of +dir is that dir's angle.
      const off = p.heading + 0.44;
      S._pos.set(p.position.x + Math.sin(off) * 2.6, p.position.y + 1.46, p.position.z + Math.cos(off) * 2.6);
      S._yaw = off;
      S._pitch = -0.03;
      S._fov = 34;
      S.pose.gaze = 'camera';          // she meets the lens (look-at via anim-core)
      S.pose.expression = 'narrow';
      S.lens.dof = true; S.lens.autoFocus = true; S.lens.aperture = 0.95;
      S.lens.nearRange = 0.8; S.lens.farRange = 2.2;   // background gone by ~5 m
      S.lens.filter = 'warm'; S.lens.filterAmt = 0.65;
      S.lens.grain = 0.16; S.lens.vignette = 0.48;
      S.lens.frameAspect = 2.39;
      S.setTimeScale(0);
      // the shot is the shot: no chrome, no panels, no hint line. Through the
      // real button, so the photograph is exactly what the button produces.
      S._ui.querySelector('#st-hud').click();
      S._ui.classList.add('hidden');
      S._hint.classList.add('hidden');
      // let the damped look-at and lids settle, and the pass compile
      await new Promise(r => setTimeout(r, 1400));
      if (!S.pass?.enabled) throw new Error('photo pass never armed');
      if (ctx.state !== 'studio') throw new Error('studio lost the world to state ' + ctx.state);
    })()`,
    criteria: [
      'Aloy fills the centre of the frame, sharp, with her face turned toward the lens',
      'the background is clearly defocused while she is not',
      'black bars top and bottom (a 2.39 letterbox), warm grade, soft vignette',
      'NO HUD elements and NO studio panels anywhere in the image',
    ],
  },

  /* ----------------------------------------------------------------- A79d */
  {
    id: 'A79d-studio-gate-shape', kind: 'runner', lane: 'studio',
    title: 'Every studio gate is built from fields the runner actually reads — a staging block the harness ignores cannot ship as a green gate',
    timeout: 20000,
    check({ GATES: ALL } = {}) {
      /**
       * V79 was written with `eval` + `wait`. tools/gates.mjs reads neither.
       * The gate loaded, ran no staging at all, screenshotted a plain gameplay
       * frame and reported NEEDS-JUDGE — indistinguishable, in the summary,
       * from a gate that had done its job. The runner cannot warn about this
       * (an unknown key is just a key), so the lane gates itself on it.
       *
       * The whitelist is derived from the runner's own source in the sibling
       * file, not from memory, so it cannot drift: `grep -o 'gate\\.<field>'`.
       */
      const KNOWN = new Set([
        'id', 'kind', 'lane', 'title', 'timeout',
        'setup', 'settle', 'assert', 'criteria',
        'plain', 'params', 'check', 'chaos', 'chaosAfter', 'allowSystemErrors',
        'source',   // stamped onto every gate by the runner's own merge step
      ]);
      const KINDS = new Set(['action', 'visual', 'runner']);
      const mine = (ALL || []).filter((g) => g.lane === 'studio');
      if (mine.length < 6) {
        return { pass: false, detail: `only ${mine.length} studio gates reached the runner — the lane file did not fully load` };
      }
      const problems = [];
      for (const g of mine) {
        for (const k of Object.keys(g)) {
          if (!KNOWN.has(k)) problems.push(`${g.id}: field "${k}" is never read by tools/gates.mjs`);
        }
        if (!KINDS.has(g.kind)) problems.push(`${g.id}: kind "${g.kind}" is not a kind the runner dispatches`);
        if (g.kind === 'action' && typeof g.assert !== 'string') problems.push(`${g.id}: action gate with no assert string`);
        if (g.kind === 'visual' && !g.criteria) problems.push(`${g.id}: visual gate with no criteria to judge`);
        // a visual gate that stages nothing is a screenshot of the default
        // frame — legal, but never for THIS lane, whose whole subject is a
        // mode you have to open first.
        if (g.kind === 'visual' && typeof g.setup !== 'string') problems.push(`${g.id}: visual studio gate does not stage photo mode in \`setup\``);
        if (g.kind === 'runner' && typeof g.check !== 'function') problems.push(`${g.id}: runner gate with no check()`);
      }
      const detail = `${mine.length} studio gates checked (${mine.map((g) => g.id).join(', ')})`;
      if (problems.length) return { pass: false, detail: problems.join(' | ') + ' — ' + detail };
      return { pass: true, detail };
    },
  },
];
