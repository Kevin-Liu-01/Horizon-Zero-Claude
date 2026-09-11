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
    /*
     * 300 s, and it is headroom, not slack. Every wait in here is capped in
     * WALL milliseconds already (`simSleep`'s `capX`), so a hung page still
     * ends the gate in well under a minute of its own accounting — the budget
     * only decides whether a CONTENDED box is allowed to finish. Measured: 23 s
     * with the lane alone on the machine, and a 120 s timeout on the same
     * commit when a second lane's full suite shared the CPU, which reported
     * `ERR: gate assert timeout` — a red that says nothing about the build. The
     * assertions below are untouched; only the patience is.
     */
    settle: 600, timeout: 300000,
    assert: `(async () => {
      ${SIMCLOCK} ${FREEZE} ${PARK} ${ENTER}
      const ctx = __CTX__, S = ctx.studio;
      if (!S) return { pass: false, detail: 'no ctx.studio' };
      if (!(await enterStudio())) return { pass: false, detail: 'F10 did not open photo mode' };

      /*
       * THE HEALTH THE SUBJECT WALKED IN WITH. A photo mode undoes what it
       * staged; it must not HAND OUT what it never took. The first Round 4 cut
       * healed to maxHealth on the way out of a filmed death, so
       * F10 -> Death -> Esc was a free full heal in three inputs (judged:
       * 37 HP in, 100 HP out) — and since the Death button is one bind away
       * during live combat, that is a gameplay exploit shipped by a camera.
       * Read here rather than after the hit below, because the hit is staged
       * too and the same rule covers it: exit must return EXACTLY this number.
       */
      const healthIn = ctx.player.health;

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
      const headY = () => {
        const b = p.animator?.b?.head?.bone;
        return b ? +b.matrixWorld.elements[13].toFixed(2) : null;
      };
      const headUp = headY();
      poseBtns.find((b) => b.dataset.pose === 'death').click();
      await sleep(600);
      const diedTo = ctx.state;
      const died = p.health <= 0 || diedTo === 'studio' || diedTo === 'dead';

      /* The pose has to be ON THE CHARACTER, not merely in her health. The
       * studio shipped a death that zeroed health, latched every flag the
       * panel reports and left Aloy STANDING through the whole shot, because
       * the crumple is gated on ctx.state === 'dead' and the studio was
       * taking that state back on the next tick. Measured on the skeleton:
       * _deadW (the animator's own gate) and the head's world height, which
       * drops ~1.3 m when she actually goes down.
       *
       * TIMED IN SIM SECONDS, NOT WALL MILLISECONDS. The crumple is scrubbed
       * off the animator's _dieT, which advances on SIM dt, and the clip's
       * own 2.375 s tail parks on a bad STANDING frame (the player-anim defect
       * documented in src/studio/pose.js, which this gate deliberately does not
       * assert around). A wall-clock sleep therefore samples a different
       * point of the clip on every box: it read 1.21 m of fall on a contended
       * one and 0.25 m on a free one — same build, same code, and the second
       * reading was nothing but the sample landing past the tail. Waiting
       * ~1.2 s of SIM puts it where the comment always claimed it was, inside
       * the crumple; the minimum across the window comes along so a future red
       * says whether she never went down or merely stood back up.
       */
      let headMin = headUp;
      await simSleep(1.2, () => {
        const y = headY();
        if (y !== null && (headMin === null || y < headMin)) headMin = y;
      });
      const deadW = S.debug().pose.deadW;
      const headDown = headY();
      const fell = headUp !== null && headDown !== null ? +(headUp - headDown).toFixed(2) : null;
      const fellMax = headUp !== null && headMin !== null ? +(headUp - headMin).toFixed(2) : null;

      await sleep(2600);                        // WALL seconds, past the 3200 ms respawn
      const heldState = ctx.state;
      const teleportedM = p.position.distanceTo(deathPos);
      const stillDown = p.health <= 0;

      /* ---- 4b. the death PRESENTATION must not land on the photograph ----
       * shell-menus answers 'player-died' with a card and, worse for a photo
       * mode, with a CSS grade on the render canvas
       * (grayscale/brightness/contrast, their A69 asserts the peak > 0.8).
       * Both are right for gameplay and both are wrong here: the frame is the
       * lens's. Measured on the live canvas, not on our own intent.
       */
      const canvasFilter = getComputedStyle(ctx.renderer.domElement).filter || 'none';
      const greyed = canvasFilter !== 'none' && canvasFilter !== '';

      /* ---- 5. jump / roll / crouch are not refused -------------------- */
      const refusals = [];
      for (const id of ['roll', 'jump', 'land', 'pickup', 'interact', 'crouch', 'idle']) {
        const r = S.playPose(id);
        if (!r.ok) refusals.push(id + '(' + r.detail + ')');
        await sleep(60);
      }
      S.exit();
      await sleep(250);
      // A death the studio staged is the studio's to retire on the way out:
      // leaving the card up hands the photographer a living valley with YOU
      // DIED painted across it.
      const cardLeftUp = !!document.body.classList.contains('hzc-dead')
        || !!ctx.menus?.deathState
        || !!document.querySelector('.mn-death.show');
      const filterLeftOn = (getComputedStyle(ctx.renderer.domElement).filter || 'none') !== 'none';

      const detail = 'states[' + stateLog.join(' ') + '] poses[' + poseLog.join(' ') + ']'
        + ' hitTookDamage=' + hitTook + ' hitSlot=' + hitSlot + ' stateDuringHit=' + stateKept
        + ' deathFilmed=' + died + ' deadW=' + deadW + ' headFell=' + fell + 'm(max ' + fellMax + 'm)'
        + ' stateAfterRespawnWindow=' + heldState
        + ' subjectMoved=' + teleportedM.toFixed(2) + 'm stillDown=' + stillDown
        + ' canvasFilterDuringDeath=' + canvasFilter
        + ' cardLeftUpAfterExit=' + cardLeftUp + ' filterLeftOn=' + filterLeftOn
        + ' exitState=' + ctx.state + ' health=' + healthIn + '->' + p.health
        + (refusals.length ? ' REFUSED=' + refusals.join(',') : ' allPosesAccepted');

      if (stateBad.length) return { pass: false, detail: 'cast states did not stick: ' + stateBad.join(',') + ' — ' + detail };
      if (!deathOk) return { pass: false, detail: 'Death button left the machine alive — ' + detail };
      if (!hitTook) return { pass: false, detail: 'takeDamage still refused in studio state (player-anim-17) — ' + detail };
      if (hitSlot !== 'hitChest' && hitSlot !== 'hitHead') return { pass: false, detail: 'no hit-react layer started — ' + detail };
      if (!died) return { pass: false, detail: 'death pose did nothing — ' + detail };
      if (!(deadW > 0.85)) return { pass: false, detail: 'the death never reached the animator (deadW=' + deadW + ') — ' + detail };
      if (!(fell > 0.8)) {
        return {
          pass: false,
          detail: (fellMax > 0.8
            ? 'she went down (' + fellMax + ' m) and then STOOD BACK UP by the sample (' + fell + ' m) — the crumple is not holding'
            : 'she died standing up: head dropped only ' + fell + ' m, never more than ' + fellMax + ' m')
            + ' — ' + detail,
        };
      }
      if (heldState !== 'studio' && heldState !== 'dead') return { pass: false, detail: 'something took the world off the studio mid-shoot (state=' + heldState + ') — ' + detail };
      if (teleportedM > 0.6) return { pass: false, detail: 'the subject was teleported ' + teleportedM.toFixed(1) + ' m out of frame by the respawn — ' + detail };
      if (!stillDown) return { pass: false, detail: 'the death would not hold: she was healed out of the pose mid-shoot — ' + detail };
      if (greyed) return { pass: false, detail: 'the death card graded the photograph (canvas filter "' + canvasFilter + '") — ' + detail };
      if (ctx.state !== 'playing') return { pass: false, detail: 'exit did not restore playing — ' + detail };
      if (cardLeftUp) return { pass: false, detail: 'exit left the death card up over a living world — ' + detail };
      if (filterLeftOn) return { pass: false, detail: 'exit left a grade on the canvas — ' + detail };
      if (p.health <= 0) return { pass: false, detail: 'exit handed back a live world with a dead Aloy in it — ' + detail };
      if (p.health > healthIn) {
        return { pass: false, detail: 'photo mode HEALED her out of a staged death: ' + healthIn + ' HP in, '
          + p.health + ' HP out — a free heal is not a camera undo — ' + detail };
      }
      if (p.health < healthIn) {
        return { pass: false, detail: 'photo mode left her DOWN health it staged itself: ' + healthIn + ' HP in, '
          + p.health + ' HP out — ' + detail };
      }
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
      // Count RENDERED frames across the flight so the +-1-frame slack the
      // bands below allow is MEASURED on this box rather than assumed.
      let frames = 0, raf = 0;
      const tick = () => { frames++; raf = requestAnimationFrame(tick); };
      S._keys.add('KeyW');
      const w0 = performance.now();
      raf = requestAnimationFrame(tick);
      await sleep(900);
      S._keys.delete('KeyW');
      cancelAnimationFrame(raf);
      const flew = ctx.camera.position.distanceTo(p0);
      const realWall = (performance.now() - w0) / 1000;
      const simDrift = ctx.engine.simTime - sim0;
      /*
       * 14 m/s nominal. The lens flies on WALL seconds, so with the world
       * frozen it must cover ~14 * realWall regardless of how slowly this box
       * renders.
       *
       * The band was "> expect * 0.33", which is not a real-dt assertion at
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
      const ratio = expect > 0 ? flew / expect : 0;
      const frameS = realWall / Math.max(1, frames);          // seconds/frame here
      const slack = 1.6 * frameS / Math.max(0.2, realWall);   // +-1.6 frames of it
      const loBand = Math.max(0.45, 0.9 - slack);
      const hiBand = 1.15 + slack;

      /* ---- 3b. the same claim, DETERMINISTICALLY ---------------------
       * The wall flight above only catches a lossy dt clamp when THIS box
       * renders slower than the clamp: at 50 fps a lens capped at 1/20 s per
       * frame is indistinguishable from a correct one, so the gate went green
       * on a fast box and red on a slow one for the same code. Drive KNOWN
       * frame times by hand instead — synchronously, so no engine frame
       * interleaves — and the claim holds on every box.
       */
      const drive = (dtF, n) => {
        S._keys.add('KeyW');
        const q0 = ctx.camera.position.clone();
        for (let i = 0; i < n; i++) S.interpolate(0, dtF);
        const d = ctx.camera.position.distanceTo(q0);
        S._keys.delete('KeyW');
        return d / (14 * dtF * n);
      };
      const at8fps = drive(0.125, 8);   // a slow frame: every second spent
      const atStall = drive(4.0, 1);    // a 4 s hitch: nothing spent

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
        + ' | flew=' + flew.toFixed(2) + 'm in ' + realWall.toFixed(2) + 's wall (expect ~' + expect.toFixed(1) + 'm)'
        + ' ratio=' + ratio.toFixed(2) + ' band=[' + loBand.toFixed(2) + ',' + hiBand.toFixed(2) + ']'
        + ' over ' + frames + ' frames @' + (1 / Math.max(1e-3, frameS)).toFixed(1) + 'fps simDrift=' + simDrift.toFixed(4)
        + ' | driven 8fps=' + (at8fps * 100).toFixed(0) + '% stall=' + (atStall * 100).toFixed(0) + '%'
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
      if (frames < 3) return { pass: false, detail: 'only ' + frames + ' frames rendered during the flight — the measurement is broken, not the build — ' + detail };
      if (ratio < loBand) return { pass: false, detail: 'lens flew at ' + (ratio * 100).toFixed(0) + '% of wall speed — real dt is being lost, not spent (a per-frame clamp under the frame time, or a fixed 1/60) — ' + detail };
      if (ratio > hiBand) return { pass: false, detail: 'lens flew at ' + (ratio * 100).toFixed(0) + '% of wall speed — real dt is being spent more than once per frame — ' + detail };
      if (at8fps < 0.97) return { pass: false, detail: 'driven at 8 fps the lens spent only ' + (at8fps * 100).toFixed(0) + '% of its real seconds — the per-frame dt clamp is lossy, so the fly cam slows down with the frame rate — ' + detail };
      if (atStall > 0.02) return { pass: false, detail: 'a 4 s stall moved the lens ' + (atStall * 100).toFixed(0) + '% of 56 m — a hitch must be dropped, not clamped-and-spent — ' + detail };
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
      // Each trip has to be the ONLY thing armed or it proves nothing about
      // its own control, so the exposure trip puts the vignette back first.
      const expOn = await trip('exposure', () => {
        const v = S._ui.querySelector('#st-vig'); v.value = '0';
        v.dispatchEvent(new Event('input', { bubbles: true }));
        const e = S._ui.querySelector('#st-exposure'); e.value = '0.6';
        e.dispatchEvent(new Event('input', { bubbles: true }));
      }, () => 'ev=' + u.uExposure.value.toFixed(2));

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
      if (!expOn) return { pass: false, detail: 'exposure did not arm the pass — ' + detail };
      if (filters < 6) return { pass: false, detail: 'only ' + filters + ' filters — ' + detail };
      if (frames < 6) return { pass: false, detail: 'only ' + frames + ' frames — ' + detail };
      if (!(focus > 1.4 && focus < 4.5)) return { pass: false, detail: 'auto-focus did not land on the subject 2.6 m away — ' + detail };
      if (headY !== null && Math.abs(headY - camY) > 0.8) return { pass: false, detail: 'auto-focus subject is not head height — ' + detail };
      if (!offAfter) return { pass: false, detail: 'pass still enabled after exit — gameplay pays for it — ' + detail };
      return { pass: true, detail };
    })()`,
  },

  /* ----------------------------------------------------------------- A79e */
  {
    id: 'A79e-pose-overlay-frozen', kind: 'action', lane: 'studio',
    title: 'The gaze + expression overlay is IDEMPOTENT with the world frozen: holding a pose at timeScale 0 does not walk the bones it writes',
    setup: `(async () => { __CTX__.input.enabled = true; })()`,
    settle: 600, timeout: 90000,
    assert: `(async () => {
      ${SIMCLOCK} ${ENTER}
      const ctx = __CTX__, S = ctx.studio;
      if (!S) return { pass: false, detail: 'no ctx.studio' };
      if (!(await enterStudio())) return { pass: false, detail: 'F10 did not open photo mode (state=' + ctx.state + ')' };

      const a = ctx.player.animator;
      if (!a || !a.b) return { pass: null, detail: 'SKIP: no animator bone table' };
      /*
       * WHY THIS GATE EXISTS. \`BoneSpace.rotChar\` MULTIPLIES into the bone. In
       * gameplay the animator rewrites every bone from its clips each frame, so
       * last frame's delta is gone before this frame's is added. The animator
       * runs on SIM dt; this overlay runs on REAL dt (it must, or the face
       * freezes with the world). At timeScale 0, therefore, NOTHING resets the
       * bone and every rendered frame compounds — measured at ~1.4 rad/s, which
       * shut Aloy's lids over her eyes as flat plates inside two seconds of
       * composing a shot. Invisible in motion; ruins every frozen portrait,
       * which is the only kind photo mode takes.
       *
       * The claim is the general one, not the symptom: hold a pose, freeze,
       * and every bone the overlay writes must read the same at the end as at
       * the start. Time is frozen for REAL seconds of rendered frames, so a
       * per-frame delta has somewhere to accumulate if one is still there.
       */
      const names = ['eyeL', 'eyeR', 'lidUL', 'lidUR', 'lidLL', 'lidLR', 'head', 'neck1'];
      const bones = [];
      for (const n of names) {
        const e = a.b[n];
        const bone = e && (e.bone || e);
        if (bone && bone.quaternion) bones.push([n, bone]);
      }
      if (bones.length < 4) return { pass: null, detail: 'SKIP: only ' + bones.length + ' of the overlaid bones exist on this rig' };

      // hold a pose that drives BOTH channels: gaze (absolute solve) and lids
      // (fixed angles — the half that ran away).
      S.pose.gaze = 'camera';
      S.pose.expression = 'narrow';
      S.pose.expressionAmt = 1;
      S.setTimeScale(1);
      await sleep(900);                       // let gaze + lids damp to target
      S.setTimeScale(0);
      await sleep(500);                       // settle ON the frozen frame
      if (ctx.engine.timeScale !== 0) return { pass: false, detail: 'could not freeze the world (ts=' + ctx.engine.timeScale + ')' };

      const snap = () => bones.map(([, b]) => b.quaternion.clone());
      const q0 = snap();
      const s0 = ctx.engine.simTime;
      // count rendered frames: a drift claim is only worth anything if frames
      // actually went by while the world did not.
      let frames = 0, raf = 0;
      const tick = () => { frames++; raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
      await sleep(2000);
      cancelAnimationFrame(raf);
      const q1 = snap();
      const simDrift = ctx.engine.simTime - s0;

      let worst = 0, worstName = '';
      for (let i = 0; i < bones.length; i++) {
        // angle between the two orientations, in radians
        const d = Math.min(1, Math.abs(q0[i].dot(q1[i])));
        const ang = 2 * Math.acos(d);
        if (ang > worst) { worst = ang; worstName = bones[i][0]; }
      }

      // ...and the face must come back untouched when photo mode closes.
      S.exit();
      await sleep(300);
      const afterExit = S.debug().pose.lidUp;

      const detail = 'held narrow+camera frozen for 2.0s over ' + frames + ' rendered frames'
        + ' (simDrift=' + simDrift.toFixed(4) + 's) | worst bone drift=' + worst.toFixed(4)
        + ' rad on ' + worstName + ' across ' + bones.length + ' bones [' + bones.map(([n]) => n).join(',') + ']'
        + ' | lidUp after exit=' + afterExit;

      if (frames < 8) return { pass: false, detail: 'only ' + frames + ' frames rendered while frozen — the measurement is broken, not the build — ' + detail };
      if (Math.abs(simDrift) > 1e-6) return { pass: false, detail: 'the world simulated while frozen, so the animator was resetting the bones and this proves nothing — ' + detail };
      // 0.01 rad = 0.57 deg. The runaway was 1.4 rad/s, i.e. ~2.8 rad over this
      // window — 280x this bar — so the threshold is nowhere near the failure.
      if (worst > 0.01) return { pass: false, detail: 'the overlay walked ' + worstName + ' by ' + worst.toFixed(3) + ' rad with the world frozen — a per-frame delta is compounding because nothing resets the bone at timeScale 0 — ' + detail };
      if (afterExit !== 0) return { pass: false, detail: 'exit left lid state armed — ' + detail };
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
      const off = p.heading + 0.46;
      // 1.8 m: a head-and-shoulders portrait, not a full-length record shot.
      // At fov 36 that is 1.17 m of subject over the full window, and the 2.39
      // letterbox keeps 74 % of it — so her head and shoulders own the frame
      // instead of sharing it with four metres of grass.
      S._pos.set(p.position.x + Math.sin(off) * 1.8, p.position.y + 1.52, p.position.z + Math.cos(off) * 1.8);
      S._yaw = off;
      S._pitch = -0.06;                // head onto the upper third
      S._fov = 36;
      S.pose.gaze = 'camera';          // she meets the lens (look-at via anim-core)
      S.pose.expression = 'narrow';
      S.lens.dof = true; S.lens.autoFocus = true; S.lens.aperture = 1.0;
      S.lens.nearRange = 0.7; S.lens.farRange = 1.6;   // background gone by ~4 m
      S.lens.filter = 'warm'; S.lens.filterAmt = 0.65;
      // She is lit by a low sun somewhere behind her: without the print open
      // the face the portrait is about goes to silhouette. Measured on film.
      S.lens.exposure = 0.55;
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
      'a head-and-shoulders portrait: Aloy fills the centre of the frame, sharp, with her face turned toward the lens and readable (not a silhouette)',
      'the background is clearly defocused while she is not',
      'black bars top and bottom (a 2.39 letterbox), warm grade, soft vignette',
      'NO HUD elements and NO studio panels anywhere in the image',
    ],
  },

  /* ----------------------------------------------------------------- A79f */
  {
    id: 'A79f-photo-entry', lane: 'studio', kind: 'action',
    title: 'F10 from the pause hub opens a CLEAN photograph, Esc leaves in ONE press even when another lane eats the keydown, and a filmed death is undone exactly — never healed',
    setup: `(async () => { __CTX__.input.enabled = true; })()`,
    settle: 400, timeout: 120000,
    assert: `(async () => {
      ${SIMCLOCK} ${ENTER}
      const ctx = __CTX__, S = ctx.studio;
      if (!S) return { pass: false, detail: 'no ctx.studio' };
      const bad = [];
      // dispatch the way a keyboard does: body target, so window-capture
      // listeners really get the first look and registration order matters.
      const key = async (code, ms) => {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }));
        await sleep(40);
        document.body.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true, cancelable: true }));
        await sleep(ms || 260);
      };
      if (ctx.state !== 'playing') ctx.state = 'playing';
      ctx.player.health = 37;

      /* ---- 1. F10 FROM THE PAUSE HUB -------------------------------------
       * The documented entry states are playing / paused / dead / victory,
       * and 'paused' is the one a photographer actually uses: you see a shot,
       * you hit Esc, you hit F10. The lane shipped guessing the menus API
       * (\`ctx.menu.close()\`; the published name is \`ctx.menus\` with
       * closeHub/closeModal) and optional chaining swallowed the miss, so
       * photo mode opened with the full-screen hub — map, tabs, status strip —
       * painted over 100% of the photograph. Staged through the real keys.
       */
      await key('Escape');
      const pausedOk = !!ctx.menus ? (ctx.menus.hubOpen === true) : (ctx.state === 'paused');
      if (!ctx.menus && ctx.state !== 'paused') bad.push('could not reach a paused/hub state to enter from');
      if (!(await enterStudio())) return { pass: false, detail: 'F10 from paused did not open photo mode (state=' + ctx.state + ')' };

      const hubOpen = !!ctx.menus?.hubOpen;
      const hubShown = !!document.querySelector('.mn-hub.show, #hub.show');
      const bodyHub = document.body.classList.contains('hzc-hub-open');
      /* The decisive read is not a class name, it is WHAT IS IN FRONT OF THE
       * LENS. Hit-test the middle of the viewport: it must be the renderer's
       * canvas (or the studio's own chrome), never another lane's surface. */
      const cx = Math.round(window.innerWidth / 2), cy = Math.round(window.innerHeight / 2);
      const hit = document.elementFromPoint(cx, cy);
      const canvas = ctx.renderer.domElement;
      const studioRoots = ['#studio-ui', '#studio-guides', '#studio-hint'];
      const hitOk = !!hit && (hit === canvas || hit.contains(canvas)
        || studioRoots.some((sel) => hit.closest?.(sel)));
      // NB: no regex literal here. A backslash escape inside this template
      // literal is eaten before the page ever sees it (/\s+/ would arrive as
      // /s+/ and split on the letter s), so the class list is joined by hand.
      const hitName = hit
        ? hit.tagName + (hit.id ? '#' + hit.id : '')
          + (typeof hit.className === 'string' && hit.className.trim()
            ? '.' + hit.className.trim().split(' ').filter(Boolean).join('.') : '')
        : 'null';
      if (hubOpen) bad.push('the pause hub is still open over the photograph');
      if (hubShown) bad.push('the hub element still carries .show');
      if (bodyHub) bad.push('body still carries hzc-hub-open');
      if (!hitOk) bad.push('the centre of frame is ' + hitName + ', not the render canvas');

      /* ---- 2. ESC IS ONE PRESS ------------------------------------------
       * Judged at two presses: the hub's own capture-phase handler (registered
       * before the studio's, because main.js installs menus first) ate the
       * first Escape to close the hub, and only the second reached photo mode.
       */
      await key('Escape');
      const escOnce = { state: ctx.state, active: S.active };
      if (S.active || ctx.state === 'studio') bad.push('one Esc did not leave photo mode (state=' + ctx.state + ')');
      if (!S.active && ctx.state !== 'playing') bad.push('Esc left the world in ' + ctx.state + ', not playing');
      if (S.active) S.exit();
      await sleep(200);

      /* ---- 3. ...EVEN WHEN ANOTHER LANE CONSUMES THE KEYDOWN -------------
       * Ordering is main.js's, not this lane's, so the studio can never be
       * guaranteed the first look. Staged with the real thief: shell-menus'
       * death card parks on 'choice' and swallows Escape outright. A probe
       * listener on \`document\` capture proves the keydown really was
       * consumed upstream (window capture runs before document capture).
       */
      let sawKeydown = false;
      const probe = (e) => { if (e.code === 'Escape') sawKeydown = true; };
      document.addEventListener('keydown', probe, true);
      if (!(await enterStudio())) { document.removeEventListener('keydown', probe, true); return { pass: false, detail: 'photo mode would not reopen' }; }
      const hadDeath = ctx.menus ? ctx.menus.deathState : undefined;
      let consumedByOther = false;
      if (ctx.menus) {
        ctx.menus.deathState = 'choice';
        sawKeydown = false;
        await key('Escape');
        consumedByOther = !sawKeydown;
        ctx.menus.deathState = hadDeath ?? null;
      }
      document.removeEventListener('keydown', probe, true);
      const escUnderThief = { state: ctx.state, active: S.active, consumedByOther };
      if (ctx.menus) {
        if (!consumedByOther) bad.push('staging failed: nothing consumed the Escape keydown, so the fallback was never exercised');
        else if (S.active) bad.push('Esc was eaten by another lane and photo mode never closed — the keyup fallback is not working');
      }
      if (S.active) S.exit();
      await sleep(250);

      /* ---- 4. A FILMED DEATH IS UNDONE, NOT REWARDED ---------------------
       * F10 -> Death -> Esc used to hand back FULL health (judged: 37 in,
       * 100 out) — three inputs, no checkpoint spent, and the Death button is
       * one bind away from live combat.
       */
      if (ctx.state !== 'playing') ctx.state = 'playing';
      ctx.player.health = 37;
      const hpIn = ctx.player.health;
      if (!(await enterStudio())) return { pass: false, detail: 'photo mode would not open for the death shot' };
      const snap = S.debug().healthIn;
      S.playPose('death');
      await simSleep(0.8);
      const hpDown = ctx.player.health;
      await key('Escape');
      await sleep(300);
      const hpOut = ctx.player.health;
      if (S.active) S.exit();
      if (!(hpDown <= 0)) bad.push('the Death pose never dropped her health (' + hpDown + ')');
      if (hpOut > hpIn) bad.push('exit HEALED her: ' + hpIn + ' -> ' + hpOut + ' HP');
      if (!(hpOut > 0)) bad.push('exit handed back a living world with a 0 HP Aloy');
      if (hpOut !== hpIn) bad.push('exit did not restore the health she walked in with: ' + hpIn + ' -> ' + hpOut);
      if (snap !== hpIn) bad.push('studio.debug().healthIn read ' + snap + ', not ' + hpIn);

      if (ctx.state !== 'playing') ctx.state = 'playing';
      const detail = 'enteredFromPausedHub=' + pausedOk
        + ' | overlaysAfterEnter: hubOpen=' + hubOpen + ' hubShown=' + hubShown + ' bodyHubClass=' + bodyHub
        + ' centreOfFrame=' + hitName
        + ' | esc#1 -> ' + JSON.stringify(escOnce)
        + ' | escWithThief -> ' + JSON.stringify(escUnderThief)
        + ' | death ' + hpIn + ' -> ' + hpDown + ' -> ' + hpOut + ' HP (snapshot ' + snap + ')';
      if (bad.length) return { pass: false, detail: bad.join(' | ') + ' — ' + detail };
      return { pass: true, detail };
    })()`,
  },

  /* ----------------------------------------------------------------- A79g */
  {
    id: 'A79g-death-menu-live', lane: 'studio', kind: 'action',
    title: 'A REAL death mid-shoot on a build with no ?shot=1: the world keeps living, the lens keeps flying, the crumple never restarts, and the exit resolves the death identically however long the shoot ran',
    setup: `(async () => { __CTX__.input.enabled = true; })()`,
    settle: 400, timeout: 180000,
    /*
     * THE GATE THAT COULD NOT SEE. Every other studio gate loads `?shot=1`,
     * and `Game._simulate()`'s liveness test ends in `|| params.has('shot')`
     * (src/main.js) — so under the suite the frame loop runs no matter WHAT
     * `ctx.state` says, and an entire class of bug (a lane parking the world on
     * a state `live` does not list) was structurally invisible. `shell-menus`
     * parks 'death-menu' 1.15 s after a real death; photo mode froze solid,
     * still repainting its panels over the last rendered frame, and eight green
     * studio gates said nothing. Measured before the fix: W held 0.8 s moved
     * the lens 0.000 m and `engine.simTime` advanced 0.000 s across 45 drawn
     * frames.
     *
     * So this gate deletes the flag FIRST, on the live URLSearchParams object
     * `main.js` reads (`ctx.params` is that same object), and everything below
     * is measured against the predicate a player actually runs.
     */
    assert: `(async () => {
      ${SIMCLOCK} ${ENTER}
      const ctx = __CTX__, S = ctx.studio, e = ctx.engine;
      if (!S) return { pass: false, detail: 'no ctx.studio' };
      const bad = [];
      /* ---- 0. BE A REAL BUILD ------------------------------------------- */
      ctx.params.delete('shot');
      if (ctx.params.has('shot')) return { pass: false, detail: 'could not clear ?shot=1 — this gate would be blind' };
      const key = async (code, ms) => {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }));
        await sleep(40);
        document.body.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true, cancelable: true }));
        await sleep(ms || 200);
      };
      const hold = async (code, ms) => {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }));
        await sleep(ms);
        document.body.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true, cancelable: true }));
      };

      /* ---- 1. A REAL DEATH, THROUGH THE REAL PANEL BUTTON ----------------
       * Not \`playPose('death')\`: that one is STAGED and deliberately arms no
       * pipeline, which is exactly why it never caught this. The Knockdown
       * chip at low health emits \`player-damage\` -> \`takeDamage\` -> \`_die()\`
       * -> \`player-died\` -> the card, the grade and the park. */
      ctx.state = 'playing';
      ctx.player.health = 25;
      await sleep(150);
      if (!(await enterStudio())) return { pass: false, detail: 'photo mode would not open (state=' + ctx.state + ')' };
      const chip = document.querySelector('#st-poses button[data-pose="knockdown"]');
      if (!chip) return { pass: false, detail: 'the ALOY panel has no Knockdown chip to press' };
      chip.click();

      /* ---- 2. SURVIVE THE PARK ------------------------------------------
       * shell-menus raises its card at DEATH_HOLD_S (1.15 s) from its own rAF.
       * Waited in WALL time: if the bug is present the sim clock is stopped,
       * so a sim-timed wait here would never return. */
      await sleep(2200);
      const parked = { state: ctx.state, deathState: ctx.menus ? ctx.menus.deathState : undefined, active: S.active };
      const dbg = S.debug();
      if (!S.active) bad.push('photo mode closed itself during the death');
      if (ctx.state === 'death-menu') bad.push('the world is parked on death-menu — the frame loop is off and the studio cannot take it back');
      if (ctx.state !== 'dead') bad.push('the studio is not holding dead (state=' + ctx.state + '), so the crumple will not play');
      if (dbg.guard && dbg.guard.armed !== true) bad.push('the out-of-loop guard is not armed during a shoot');

      /* ---- 3. THE LENS STILL FLIES, THE WORLD STILL TICKS ---------------- */
      const p0x = ctx.camera.position.x, p0y = ctx.camera.position.y, p0z = ctx.camera.position.z;
      const t0 = e.simTime, f0 = e.frames;
      await hold('KeyW', 800);
      await sleep(60);
      const moved = Math.hypot(ctx.camera.position.x - p0x, ctx.camera.position.y - p0y, ctx.camera.position.z - p0z);
      const simRan = e.simTime - t0, drew = e.frames - f0;
      if (!(moved > 1.5)) bad.push('the lens is frozen: W for 0.8 s moved it ' + moved.toFixed(3) + ' m');
      if (!(simRan > 0.2)) bad.push('the world is frozen: engine.simTime advanced ' + simRan.toFixed(3) + ' s');
      if (!(drew > 5)) bad.push('the page stopped drawing entirely (' + drew + ' frames)');

      /* ---- 4. THE CRUMPLE RUNS ONCE ------------------------------------
       * \`playerAnimator\` resets \`_dieT\` the moment it ticks with ctx.state
       * not 'dead'. Two things reach for the world from outside the loop — the
       * card's park and \`_die()\`'s 3.2 s respawn — and each one costs a
       * restart if it is answered a frame late instead of in its own task. */
      const a = ctx.player.animator;
      let restarts = 0, prev = a ? a._dieT : -1, offDead = 0;
      const w0 = performance.now();
      while (performance.now() - w0 < 4200) {     // straddles the 3.2 s respawn
        await sleep(70);
        if (ctx.state !== 'dead') offDead++;
        const d = a ? a._dieT : -1;
        if (prev >= 0 && d < prev - 0.02) restarts++;
        prev = d;
      }
      const deadW = a ? a._deadW : null;
      if (restarts > 0) bad.push('the death crumple restarted ' + restarts + 'x mid-shoot (a state theft was answered a frame late)');
      if (offDead > 0) bad.push('the world left "dead" on ' + offDead + ' polls during the shoot');
      if (!(deadW > 0.9)) bad.push('the death pose is not held (deadW=' + deadW + ')');

      /* ---- 5. THE EXIT IS NOT A STOPWATCH -------------------------------
       * Holding 'dead' is what finally lets \`_die()\`'s 3.2 s respawn run, and
       * that respawn retires the death card — so an exit that read the card
       * handed back TWO different worlds for the same death depending on how
       * long the photographer shot for. Both lengths are run and compared. */
      /* Hand the first death back before staging two more. While photo mode is
       * open and pinning a corpse, _holdState() re-zeroes any health written
       * underneath it — as it must — so a probe that just assigns health and
       * carries on is staging its next scenario on top of the last one's
       * subject. Leave first, then set up. */
      if (S.active) { S.playPose('idle'); await sleep(250); S.exit(); }
      await sleep(700);
      ctx.state = 'playing';
      if (!(ctx.player.health > 0)) ctx.player.health = 100;
      await sleep(200);

      const runDeath = async (shootMs) => {
        if (S.active) S.exit();
        ctx.state = 'playing';
        ctx.player.health = 64;
        ctx.player.position.x += 3;
        ctx.player._snapToGround && ctx.player._snapToGround();
        ctx.progression && ctx.progression.checkpoint && ctx.progression.checkpoint('gate');
        await sleep(250);
        const cp = ctx.player.position.clone();
        ctx.player.position.x -= 60;              // die well away from it
        ctx.player._snapToGround && ctx.player._snapToGround();
        ctx.player.health = 25;
        const d0 = (ctx.progression && ctx.progression.stats ? ctx.progression.stats.deaths : 0) || 0;
        if (!(await enterStudio())) return { failed: 'photo mode would not reopen' };
        document.querySelector('#st-poses button[data-pose="knockdown"]').click();
        await sleep(shootMs);
        await key('Escape', 500);
        if (S.active) S.exit();
        await sleep(500);
        return {
          state: ctx.state,
          health: Math.round(ctx.player.health),
          fromCheckpoint: +ctx.player.position.distanceTo(cp).toFixed(1),
          deaths: ((ctx.progression && ctx.progression.stats ? ctx.progression.stats.deaths : 0) || 0) - d0,
        };
      };
      const shortRun = await runDeath(1700);      // exit BEFORE the 3.2 s respawn
      const longRun = await runDeath(4600);       // exit AFTER it: the card is gone
      if (shortRun.failed || longRun.failed) return { pass: false, detail: shortRun.failed || longRun.failed };
      /*
       * TOLERANCES ARE IN METRES SHE DIED AWAY FROM, NOT IN CENTIMETRES. She
       * is restored ONTO SLOPED GROUND and then settles under gravity for the
       * rest of the frame budget, so the resting spot is a physics outcome, not
       * a stored number — on a loaded box the longer shoot settled 2.1 m from
       * the checkpoint where the shorter one settled 0.4 m, and a 1.5 m
       * equality test failed a run in which both worlds were identical in every
       * way that means anything. The claim is "resolved THROUGH the checkpoint
       * rather than left where she fell", and she falls 60 m away: 8 m is well
       * inside that and still fails the real bug loudly (measured with the latch
       * removed: 0 m vs 60.5 m, and 64 HP vs 25 HP).
       */
      const NEAR = 8;
      const same = shortRun.state === longRun.state
        && shortRun.health === longRun.health
        && Math.abs(shortRun.fromCheckpoint - longRun.fromCheckpoint) < NEAR
        && shortRun.deaths === longRun.deaths;
      if (!same) bad.push('the exit depends on how long the shoot ran: ' + JSON.stringify(shortRun) + ' vs ' + JSON.stringify(longRun));
      for (const r of [shortRun, longRun]) {
        if (r.state !== 'playing') bad.push('exit left the world in ' + r.state);
        if (!(r.health > 0)) bad.push('exit handed back a 0 HP world');
        if (r.deaths !== 1) bad.push('a real death mid-shoot was not charged (stats.deaths +' + r.deaths + ')');
        if (r.fromCheckpoint > NEAR) bad.push('a real death was not resolved through the checkpoint (' + r.fromCheckpoint + ' m away, having died 60 m from it)');
      }

      /* ---- 6. F10 *FROM* THE DEATH CARD ---------------------------------
       * The same class from the other side. 'death-menu' was not an accepted
       * entry state, so F10 worked for the 1.15 s a death takes to raise its
       * card and then silently did nothing — at precisely the moment a
       * photographer reaches for it. And the death is already in progress when
       * the studio opens, so player-died fired before this object was
       * listening: the latch has to be SEEDED from the death system's state or
       * the exit is back on a stopwatch for this path alone. */
      const fromCard = async (shootMs) => {
        if (S.active) S.exit();
        ctx.state = 'playing';
        ctx.player.health = 70;
        ctx.player.position.x += 3;
        ctx.player._snapToGround && ctx.player._snapToGround();
        ctx.progression && ctx.progression.checkpoint && ctx.progression.checkpoint('gate');
        await sleep(250);
        const cp = ctx.player.position.clone();
        ctx.player.position.x -= 55;
        ctx.player._snapToGround && ctx.player._snapToGround();
        ctx.player.health = 20;
        const d0 = (ctx.progression && ctx.progression.stats ? ctx.progression.stats.deaths : 0) || 0;
        // killed in ordinary gameplay, with photo mode CLOSED
        ctx.events.emit('player-damage', { amount: 40, from: { displayName: 'a watcher' } });
        await sleep(1600);
        const atCard = { state: ctx.state, deathState: ctx.menus ? ctx.menus.deathState : undefined };
        await key('F10', 1000);
        const opened = { state: ctx.state, active: S.active, realDeath: S.debug().realDeath };
        await sleep(shootMs);
        await key('Escape', 500);
        if (S.active) S.exit();
        await sleep(500);
        return { atCard, opened, state: ctx.state, health: Math.round(ctx.player.health),
          fromCheckpoint: +ctx.player.position.distanceTo(cp).toFixed(1),
          deaths: ((ctx.progression && ctx.progression.stats ? ctx.progression.stats.deaths : 0) || 0) - d0 };
      };
      const cardShort = await fromCard(900);
      const cardLong = await fromCard(4200);
      for (const r of [cardShort, cardLong]) {
        if (ctx.menus && r.atCard.state !== 'death-menu') bad.push('staging failed: the death card never parked the world (' + r.atCard.state + ')');
        if (!r.opened.active) bad.push('F10 was refused from the death card');
        if (r.opened.active && r.opened.state !== 'dead') bad.push('entering from the card did not take the world back (' + r.opened.state + ')');
        if (!r.opened.realDeath) bad.push('entering from the card did not seed the real-death latch');
        if (r.state !== 'playing') bad.push('exit from a card-entered shoot left the world in ' + r.state);
        if (r.deaths !== 1) bad.push('the card-entered death was not charged (stats.deaths +' + r.deaths + ')');
        if (r.fromCheckpoint > NEAR) bad.push('the card-entered death was not resolved through the checkpoint (' + r.fromCheckpoint + ' m, having died 55 m from it)');
      }
      if (cardShort.health !== cardLong.health || Math.abs(cardShort.fromCheckpoint - cardLong.fromCheckpoint) > NEAR) {
        bad.push('entering from the card also depends on shoot length: ' + JSON.stringify(cardShort) + ' vs ' + JSON.stringify(cardLong));
      }

      if (ctx.state !== 'playing') ctx.state = 'playing';
      const detail = 'shot param cleared | parked=' + JSON.stringify(parked)
        + ' | W 0.8s -> lens ' + moved.toFixed(2) + ' m, sim +' + simRan.toFixed(2) + ' s, ' + drew + ' frames'
        + ' | 4.2 s hold: crumple restarts=' + restarts + ' offDead=' + offDead + ' deadW=' + (deadW === null ? 'n/a' : deadW.toFixed(3))
        + ' | exit short=' + JSON.stringify(shortRun) + ' long=' + JSON.stringify(longRun)
        + ' | fromCard short=' + JSON.stringify(cardShort) + ' long=' + JSON.stringify(cardLong);
      if (bad.length) return { pass: false, detail: bad.join(' | ') + ' — ' + detail };
      return { pass: true, detail };
    })()`,
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
      /**
       * ...AND AT LEAST ONE OF THEM MUST RUN ON THE PREDICATE A PLAYER RUNS.
       *
       * The shape check above cannot see the failure that actually shipped. The
       * runner appends `?shot=1` to every gate URL unless `plain` is set, and
       * `Game._simulate()`'s liveness test ends in `|| params.has('shot')`
       * (src/main.js) — so under the suite the frame loop runs whatever
       * `ctx.state` holds. An entire class of bug (another lane parking the
       * world on a state `live` does not list, which is how `shell-menus`
       * 'death-menu' froze photo mode solid) was therefore UNOBSERVABLE to
       * eight green studio gates. A judge found it by hand, on the first probe
       * that thought to delete the flag.
       *
       * One gate clearing it is enough to see the class; zero is blindness. So
       * the lane fails itself when a future round quietly drops the one gate
       * that does — which is a cheaper way to find out than another judge.
       */
      const eyesOpen = mine.filter((g) => g.plain === true
        || (typeof g.assert === 'string' && g.assert.includes("params.delete('shot')"))
        || (typeof g.setup === 'string' && g.setup.includes("params.delete('shot')")));
      if (!eyesOpen.length) {
        problems.push('every studio gate runs with ?shot=1, which forces main.js\'s `live` test true — '
          + 'no studio gate can observe a state that parks the frame loop. At least one must set `plain: true` '
          + "or call `ctx.params.delete('shot')` before it stages anything");
      }
      const detail = `${mine.length} studio gates checked (${mine.map((g) => g.id).join(', ')})`
        + ` | on the real \`live\` predicate: ${eyesOpen.map((g) => g.id).join(', ') || 'NONE'}`;
      if (problems.length) return { pass: false, detail: problems.join(' | ') + ' — ' + detail };
      return { pass: true, detail };
    },
  },
];
