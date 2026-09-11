/**
 * Round 4 gates — lane `shell-menus` (docs/ROUND4-AUDIT.md §4, port 5215).
 *
 * Same contract as tools/gates.config.mjs: ACTION gates resolve
 * { pass, detail } in page context with __CTX__/__GAME__ available; a console
 * error during a gate is an automatic FAIL. VISUAL gates capture a PNG and are
 * graded against `criteria`.
 *
 * ------------------------------------------------------------------ gate ids
 * Every id registered across `tools/gates.config.mjs` and every
 * `tools/gates.round4.*.mjs` was listed before these were claimed. `A68`,
 * `A69`, `A70`, `A72` and `V38` were all free, so the audit's four action
 * gates and its visual keep their names unsuffixed. (`A71*` belongs to
 * `shell-hud` — the compass — and is not touched here.) Three extras are
 * added on free ids because the §4 block gives this lane five gates for
 * eleven findings:
 *
 *   A70b-fast-travel   the campfire half of `missing-systems-title-save-campfire-flow`
 *   A70c-title-flow    `ui-18` / `onboarding-loop-title-screen` made LITERAL —
 *                      V38 is judged from a PNG, this counts the logos
 *   A72b-accessibility `missing-systems-accessibility`: HUD scale, colourblind
 *                      palette, reduced motion and hold-vs-toggle, each
 *                      measured where it lands rather than where it is stored
 *
 * --------------------------------------------------------------- no bleed
 * Gates share one browser, and `localStorage` is per-origin, not per-page: a
 * settings write or a fog reveal from a gate here would still be there when
 * another lane's gate booted three gates later, silently changing its FOV or
 * its save slot. Every gate below snapshots the whole store on entry and puts
 * it back in a `finally` — keys it added are removed, keys it changed are
 * restored — so the profile a later gate boots into is the one it would have
 * had if this lane's gates had never run.
 */

/** Page-context helper: N rendered frames (so `update()` has actually run). */
const FRAMES = `
  const frames = (n) => new Promise(r => { let i = 0; const t = () => (++i >= n ? r() : requestAnimationFrame(t)); requestAnimationFrame(t); });
  const wait = (ms) => new Promise(r => setTimeout(r, ms));`;

/** Page-context helper: leave localStorage exactly as it was found. */
const STORAGE_GUARD = `
  const snapStorage = () => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; };
  const restoreStorage = (snap) => {
    try {
      const now = [];
      for (let i = 0; i < localStorage.length; i++) now.push(localStorage.key(i));
      for (const k of now) if (!(k in snap)) localStorage.removeItem(k);
      for (const k of Object.keys(snap)) if (localStorage.getItem(k) !== snap[k]) localStorage.setItem(k, snap[k]);
    } catch { /* storage off */ }
  };`;

/** Page-context helper: a real keydown in the window capture phase. */
const KEY = `
  const key = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }));`;

/** Page-context helper: block until the menus system has installed itself. */
const WAIT_MENUS = `
  const waitMenus = async (ms = 20000) => {
    const t0 = performance.now();
    while (!__CTX__.menus && performance.now() - t0 < ms) await wait(100);
    return __CTX__.menus;
  };`;

export const GATES = [
  /* ===================================================================== */
  /* ui-13 — winning the game used to require a page reload                 */
  /* ===================================================================== */
  {
    id: 'A68-no-softlock', kind: 'action', lane: 'shell-menus',
    title: 'Victory is a 3 s banner, not a state the session cannot leave',
    settle: 900, timeout: 60000,
    /**
     * THE SOFT-LOCK HAD TWO HALVES and the gate has to see both.
     *
     * 1. `hud._showVictory()` set `ctx.state = 'victory'` and nothing ever set
     *    it back, so Escape did nothing and only F5 returned the game. The
     *    assert waits past this lane's 3 s banner and demands `'playing'`, then
     *    proves the pause hub answers Escape afterwards.
     * 2. `hud._victoryShown` is a LATCH, and `hud`'s own `player-respawn`
     *    handler re-asserts `state = 'victory'` while it is set — so a build
     *    that only fixed (1) soft-locked again on the next death instead. The
     *    assert therefore also kills the player after the banner and checks the
     *    world comes back.
     */
    assert: `(async () => {${FRAMES}${KEY}${STORAGE_GUARD}
      const snap = snapStorage();
      try {
        const c = __CTX__, m = c.menus;
        if (!m) return { pass: null, detail: 'SKIP: menus not installed' };
        const out = {};
        /**
         * WATCH THE CARD, DO NOT SAMPLE IT. This used to read visibility at a
         * fixed +400 ms and again at +4.4 s. Both are guesses about when the
         * card starts, and inside the full 176-gate suite the box is loaded
         * enough that the start slips past 400 ms — the gate then reported
         * "never shown" AND "still up at 4.4 s" AND a stuck hud latch, none of
         * which were true (it passed 3/3 standalone on the same commit). A
         * phantom failure in a soft-lock gate is worse than no gate: it trains
         * you to ignore the one alarm that means the session cannot recover.
         *
         * So: poll for the card to appear, then poll for it to clear, and
         * measure its LIFETIME FROM THE EVENT rather than from whenever this
         * loop first caught it — the card's own timer starts at the event, so
         * that number is load-independent. Strictly more than the old version
         * checked: appearance, a real on-screen duration (not a one-frame
         * flash), clearance, and only then the latch.
         */
        const t0 = performance.now();
        c.events.emit('victory', { source: 'gate' });
        let shownAt = -1;
        while (performance.now() - t0 < 4000) {
          if (m.audit().victory.visible) { shownAt = performance.now() - t0; break; }
          await frames(2);
        }
        out.duringBanner = { state: c.state, visible: shownAt >= 0, shownAfterMs: Math.round(shownAt) };
        let clearedAt = -1;
        while (performance.now() - t0 < 13000) {
          if (!m.audit().victory.visible) { clearedAt = performance.now() - t0; break; }
          await frames(2);
        }
        out.banner = { state: c.state, visible: m.audit().victory.visible,
                       clearedAfterMs: Math.round(clearedAt) };
        out.hudLatch = c.hud?._victoryShown ?? null;
        key('Escape'); await frames(4);
        out.escOpensHub = { hub: m.hubOpen, state: c.state, tabs: m.audit().tabsVisible };
        key('Escape'); await frames(4);
        out.escCloses = { hub: m.hubOpen, state: c.state };

        // the second half: the latch must not re-lock the next death
        const p = c.player;
        p.takeDamage(9999);
        await wait(1600);
        out.deathAfterVictory = { state: c.state, victoryVisible: m.audit().victory.visible };
        m.respawn('camp');
        await wait(400);
        out.respawned = { state: c.state, hp: Math.round(p.health) };

        const pass = out.duringBanner.visible === true
          && out.banner.state === 'playing' && out.banner.visible === false
          // a real banner, and one the session actually leaves: >= 1.5 s on
          // screen rules out a one-frame flash, <= 9 s rules out the soft-lock
          && out.banner.clearedAfterMs >= 1500 && out.banner.clearedAfterMs <= 9000
          && out.hudLatch !== true
          && out.escOpensHub.hub === true && out.escOpensHub.state === 'paused'
          && out.escCloses.hub === false && out.escCloses.state === 'playing'
          && out.deathAfterVictory.state !== 'victory'
          && out.respawned.state === 'playing' && out.respawned.hp > 0;
        return { pass, detail: out };
      } finally { restoreStorage(snap); }
    })()`,
  },

  /* ===================================================================== */
  /* ui-13 / onboarding-loop-death-no-stakes                                */
  /* ===================================================================== */
  {
    id: 'A69-death-choice', kind: 'action', lane: 'shell-menus',
    title: 'Death waits for input: ≥2 options, killer named, grayscale ramp, no auto-respawn',
    settle: 900, timeout: 60000,
    /**
     * `player._die()` schedules a 3.2 s `setTimeout` that teleports her to camp
     * and emits `player-respawn` — the "death lasts 0.7 s and costs nothing"
     * finding. This lane cannot edit player.js, so it parks `ctx.state` on
     * `'death-menu'`, which makes that timer's own `if (state !== 'dead')`
     * guard return. The gate proves the RESULT, not the trick: it counts
     * `player-respawn` events and requires ZERO of them across the whole
     * window the auto-respawn would have fired in.
     */
    assert: `(async () => {${FRAMES}${KEY}${STORAGE_GUARD}
      const snap = snapStorage();
      try {
        const c = __CTX__, m = c.menus, p = c.player;
        if (!m) return { pass: null, detail: 'SKIP: menus not installed' };
        let respawns = 0;
        c.events.on('player-respawn', () => { respawns++; });
        const out = {};

        c.events.emit('player-damage', { from: { displayName: 'Sawtooth', kind: 'sawtooth' }, amount: 12 });
        p.takeDamage(9999);
        await wait(500);
        out.early = { state: c.state, card: m.audit().death.state };
        // past player.js's 3.2 s auto-respawn, with room to spare
        await wait(4200);
        const d = m.audit().death;
        out.waiting = {
          state: c.state, cardState: d.state, visible: d.visible, options: d.options,
          killerText: d.killerText, grayPeak: d.grayPeak, filter: d.canvasFilter,
          hp: Math.round(p.health), respawns,
        };
        out.optionLabels = [...m._deathOpts.querySelectorAll('button b')].map(b => b.textContent);

        // it is a CHOICE: the world only comes back when one is taken
        m._deathOpts.querySelector('button').click();
        await wait(700);
        out.afterChoice = { state: c.state, hp: Math.round(p.health), visible: m.audit().death.visible, respawns };

        const pass = out.waiting.visible === true
          && out.waiting.options >= 2 && out.optionLabels.length >= 2
          && out.waiting.state !== 'playing'
          && out.waiting.respawns === 0
          && out.waiting.hp === 0
          && /SAWTOOTH/.test(out.waiting.killerText)
          && out.waiting.grayPeak > 0.8
          && /grayscale\\(/.test(out.waiting.filter)
          && out.afterChoice.state === 'playing'
          && out.afterChoice.visible === false
          && out.afterChoice.hp > 0
          && out.afterChoice.respawns === 1;
        return { pass, detail: out };
      } finally { restoreStorage(snap); }
    })()`,
  },

  /* ===================================================================== */
  /* ui-01 + ui-02 — the pause hub and the world map                        */
  /* ===================================================================== */
  {
    id: 'A70-hub-tabs', kind: 'action', lane: 'shell-menus',
    title: 'Escape opens a 7-tab hub; M/J/I/O/K/N/, each open theirs; a map click plants a compass waypoint in metres',
    settle: 1200, timeout: 90000,
    /**
     * Four of the seven tabs are another lane's screen — the hub ROUTES to
     * `progression.openQuestLog/openSkills` and `items.openInventory/
     * openNotebook` rather than re-drawing them. So "the tab opened" is two
     * different facts depending on the tab, and the gate checks the right one
     * for each: a delegated tab must have handed the screen to its owner
     * (`menus.delegated === id`, and `ctx.state` parked on that lane's own
     * panel state), a local tab must have rendered into the hub body.
     *
     * The waypoint half is measured on the COMPASS, not on the map: the audit
     * asks for "a waypoint that appears on the compass with metres", and that
     * ribbon belongs to `shell-hud`. The beacon in map.js renders it only while
     * that lane publishes no `hud.setWaypoint`, so the gate accepts either
     * renderer and reads the metres off whichever one is live.
     */
    assert: `(async () => {${FRAMES}${KEY}${STORAGE_GUARD}
      const snap = snapStorage();
      try {
        const c = __CTX__, m = c.menus;
        if (!m) return { pass: null, detail: 'SKIP: menus not installed' };
        const out = { tabs: [] };

        key('Escape'); await frames(6);
        out.open = { hub: m.hubOpen, state: c.state, tabsVisible: m.audit().tabsVisible, count: m.audit().tabs.length };

        const PLAN = [['KeyM','map'],['KeyJ','quests'],['KeyI','inventory'],['KeyO','crafting'],
                      ['KeyK','skills'],['KeyN','notebook'],['Comma','settings']];
        for (const [code, id] of PLAN) {
          key(code); await frames(8);
          const delegated = m.delegated === id;
          out.tabs.push({ code, id, tab: m.tab, delegated, state: c.state,
                          body: m.hubBody.childElementCount, ok: m.tab === id && (delegated || m.hubBody.childElementCount > 0) });
        }

        // back to the map and plant a waypoint with a real click
        key('KeyM'); await frames(8);
        const cv = m.map.canvas;
        const r = cv.getBoundingClientRect();
        cv.dispatchEvent(new MouseEvent('click', { clientX: r.left + r.width * 0.63, clientY: r.top + r.height * 0.37, bubbles: true }));
        await frames(4);
        out.waypoint = m.map.waypoint ? { x: +m.map.waypoint.x.toFixed(1), z: +m.map.waypoint.z.toFixed(1) } : null;
        out.distance = m.map.distanceToWaypoint();
        out.mapBaked = m.map.audit().baked;
        out.markers = m.map.audit().markers;

        key('Escape'); await frames(6);
        out.closed = { hub: m.hubOpen, state: c.state };
        await wait(700);          // the beacon re-measures the compass at 2 Hz

        const b = m.beacon.audit();
        const hudOwns = typeof c.hud?.setWaypoint === 'function';
        const compass = document.querySelector('.hzc-compass');
        const metres = (b.text || '').match(/(\\d+)\\s*m/);
        out.compass = { hudOwns, beaconVisible: b.visible, beaconText: b.text,
                        beaconOpacity: b.opacity, compassFound: !!compass,
                        docked: !!(b.rect && compass && Math.abs(b.rect.x - compass.getBoundingClientRect().x) < 40) };

        const waypointOnCompass = hudOwns
          ? true                                    // shell-hud renders it; A71 is its gate
          : (b.visible && b.opacity > 0.5 && !!metres
             && Math.abs(parseInt(metres[1], 10) - out.distance) <= 2);

        const pass = out.open.hub === true && out.open.state === 'paused'
          && out.open.tabsVisible === true && out.open.count === 7
          && out.tabs.every(t => t.ok)
          && !!out.waypoint && out.distance > 1 && out.mapBaked === true && out.markers >= 8
          && out.closed.hub === false && out.closed.state === 'playing'
          && waypointOnCompass;
        return { pass, detail: out };
      } finally { restoreStorage(snap); }
    })()`,
  },

  /* ===================================================================== */
  /* missing-systems-title-save-campfire-flow — the travel half             */
  /* ===================================================================== */
  {
    id: 'A70b-fast-travel', kind: 'action', lane: 'shell-menus',
    title: 'Fast travel: campfire-only, discovered-only, and it actually moves her',
    settle: 900, timeout: 60000,
    assert: `(async () => {${FRAMES}${STORAGE_GUARD}
      const snap = snapStorage();
      try {
        const c = __CTX__, m = c.menus, p = c.player;
        if (!m) return { pass: null, detail: 'SKIP: menus not installed' };
        const fire = c.camp?.firePosition;
        if (!fire) return { pass: null, detail: 'SKIP: no campfire in this build' };
        const out = {};

        m.openHub('map'); await frames(6);
        const site = m.map.markers().find(x => ['landmark','tallneck','lookout','cache','override','hunting-ground'].includes(x.kind)
          && Math.hypot(x.x - fire.x, x.z - fire.z) > 60);
        if (!site) return { pass: null, detail: 'SKIP: no distant site registered' };
        m.map._selected = site;

        // 1. away from the fire it is refused, with a reason a player can read
        p.position.set(fire.x + 80, p.position.y, fire.z + 80); p._snapToGround?.();
        m.map.fog.reveal(site.x, site.z, 20);
        out.awayFromFire = m.map.canFastTravel(site);

        // 2. at the fire, to somewhere never visited, it is still refused
        p.position.set(fire.x + 1.5, p.position.y, fire.z + 1.5); p._snapToGround?.();
        const far = { kind: 'landmark', name: 'unvisited', x: -300, z: -300 };
        out.undiscovered = m.map.canFastTravel(far);

        // 3. at the fire, to a discovered site, it travels
        out.allowed = m.map.canFastTravel(site);
        let fired = null;
        c.events.on('fast-travel', (e) => { fired = e; });
        const res = m.map.fastTravel(site);
        await frames(6);
        out.result = res;
        out.event = fired ? { to: fired.to, site: fired.site } : null;
        out.arrived = { x: Math.round(p.position.x), z: Math.round(p.position.z),
                        target: { x: Math.round(site.x), z: Math.round(site.z) } };
        out.hubClosed = !m.hubOpen && c.state === 'playing';

        const pass = out.awayFromFire.ok === false && /CAMPFIRE/.test(out.awayFromFire.reason)
          && out.undiscovered.ok === false
          && out.allowed.ok === true
          && res.ok === true && !!out.event
          && Math.hypot(p.position.x - site.x, p.position.z - site.z) < 2
          && out.hubClosed;
        return { pass, detail: out };
      } finally { restoreStorage(snap); }
    })()`,
  },

  /* ===================================================================== */
  /* ui-18 / onboarding-loop-title-screen — the literal half of V38          */
  /* ===================================================================== */
  {
    id: 'A70c-title-flow', kind: 'action', lane: 'shell-menus',
    title: 'Title: one logo, no keybind wall, press-any-key → moving aerial dolly → vertical menu',
    plain: true, settle: 1000, timeout: 90000,
    /**
     * `plain: true` boots the real title screen (no `?shot=1` auto-start). The
     * audit's V38 fails "on a double logo or a keybind wall" — a judge reading
     * a PNG can miss a second wordmark scrolled under the fold, so this counts
     * the RENDERED ones: every `.hzc-logo` with a non-zero box and a non-zero
     * opacity. The dolly is measured as metres of camera travel, because a
     * still vista with a menu over it looks identical in a screenshot.
     *
     * TOTAL TRAVEL WAS NOT ENOUGH, AND THE OLD `> 8` PROVED IT TWICE OVER.
     * When the closing ease was keyed to title time instead of time-since-
     * press, the camera TELEPORTED on the press — 35 m in one frame after an
     * 8 s title — and the displacement check happily counted the teleport as
     * the move. Worse, the slow orbit alone covers ~9 m in this window, so
     * `> 8` could be cleared by a camera that never closed in at all. Raising
     * the number would not have fixed either hole, and it is not even stable:
     * the sim clock runs at ~87% of wall clock on a loaded box (a 20 s hold
     * advances the title timer 17.3 s), so measured travel here ranges 10.0 to
     * 12.3 m run to run. Displacement is the wrong instrument.
     *
     * So the gate measures the quantities the shot is AUTHORED in, published
     * by `audit().title.dolly`, and holds the title 5 s first so that a
     * title-time-keyed ease has something to have wrongly spent:
     *
     *   heldEase     0 while nobody has pressed — the move has not started.
     *   easeAtPress  read 3 frames after the key. This is the direct inverse
     *                of the regression: press-relative it is ~0, title-time it
     *                would already be smoothstep(5/9) = 0.60.
     *   beat.stage   still 'dolly' 500 ms after the press — the menu waits out
     *                its 1.1 s beat instead of appearing on the first frame
     *                (the other half of the same bug).
     *   endEase      > 0.2 and radiusDrop > 6 m — the move actually RAN, and
     *                the radius only shrinks under the ease, never under the
     *                orbit, so this cannot be satisfied by orbiting.
     *   firstStep    the press-frame step in metres: < 2 against a 35 m
     *                regression and a 0.197 m measured truth.
     *   maxStep      the largest step of ANY frame in the window, same units.
     *                This is the teleport check, and it is asserted in METRES
     *                rather than m/s on purpose. Speed sounds like the better
     *                instrument, but it divides a sim-time-driven step by WALL
     *                time, and those diverge: main.js clamps realDt to
     *                MAX_FRAME = 0.05 s, so one frame can move the camera at
     *                most ~0.34 m no matter how long it took, while a fast 5 ms
     *                frame right after a slow one reads as 68 m/s — a flake, not
     *                a jump. The clamp is exactly what makes the metre bound
     *                sound: 0.33-0.34 m measured, ceiling 3, regression 35.
     *                `peakSpeed` is still reported, just not asserted.
     *
     * `dollyMetres > 8` stays as a floor so the gate keeps failing if the
     * camera stops moving altogether, but it is no longer load-bearing.
     */
    assert: `(async () => {${FRAMES}${KEY}${WAIT_MENUS}${STORAGE_GUARD}
      const snap = snapStorage();
      try {
        const c = __CTX__;
        const m = await waitMenus();
        if (!m) return { pass: null, detail: 'SKIP: menus not installed' };
        const out = { state: c.state };
        const a0 = m.audit();
        out.press = { stage: a0.title.stage, pressVisible: a0.title.pressVisible,
                      menuVisible: a0.title.menuVisible, logos: a0.title.logos,
                      wall: a0.title.keybindWallInTitle };
        const cam = c.camera;

        // sit on the title the way a player does — reading the line, looking at
        // the valley. A press-relative ease does not care; a title-time ease has
        // now spent 6 s of its 9 s budget and must discharge it in one frame.
        await wait(5000);
        out.heldTitleMs = 5000;
        out.stillPressed = m.audit().title.stage === 'press';

        out.heldEase = m.audit().title.dolly.ease;   // 0 while nobody has pressed
        out.startRadius = m.audit().title.dolly.radius;

        const p0 = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
        // sample every rendered frame across the press, not just the endpoints
        let peak = 0, maxStep = 0, samples = 0, firstStep = -1;
        let lx = p0.x, ly = p0.y, lz = p0.z, lt = performance.now();
        let sampling = true;
        const tick = () => {
          if (!sampling) return;
          const now = performance.now();
          const el = (now - lt) / 1000;
          if (el > 0.0005) {
            const step = Math.hypot(cam.position.x - lx, cam.position.y - ly, cam.position.z - lz);
            const speed = step / el;
            if (speed > peak) peak = speed;
            if (step > maxStep) maxStep = step;
            if (firstStep < 0) firstStep = step;
            samples++;
            lx = cam.position.x; ly = cam.position.y; lz = cam.position.z; lt = now;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);

        key('Space');
        // the ease must START at the press, not resume mid-flight: read it on
        // the first frames after the key. A title-time ease held for 5 s would
        // already be at smoothstep(5/9) = 0.60 here.
        await frames(3);
        out.easeAtPress = m.audit().title.dolly.ease;
        // and the menu must still be waiting out its 1.1 s beat
        await wait(500);
        out.beat = { stage: m.audit().title.stage, ease: m.audit().title.dolly.ease };

        // ride the move out well past the beat: at ~87% sim-to-wall this is
        // ~3.9 s of ease, far enough in that the thresholds below are not
        // measuring the box's frame rate
        await wait(4000);
        sampling = false;
        const a1 = m.audit();
        const p1 = cam.position;
        out.menu = { stage: a1.title.stage, menuVisible: a1.title.menuVisible,
                     items: a1.title.menuItems, logos: a1.title.logos,
                     pressVisible: a1.title.pressVisible };
        out.dollyMetres = +Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z).toFixed(2);
        out.endEase = a1.title.dolly.ease;
        out.radiusDrop = +(out.startRadius - a1.title.dolly.radius).toFixed(2);
        out.peakSpeed = +peak.toFixed(1);   // reported for diagnosis, not asserted
        out.maxStep = +maxStep.toFixed(3);
        out.firstStep = +firstStep.toFixed(3);
        out.speedSamples = samples;

        // the manual moved behind a button; the wall is gone from the title
        out.manual = { inTitle: !!document.querySelector('#title .keybinds-panel'), held: !!m._manualNode };
        m.openModal('manual'); await frames(4);
        out.manualModal = { open: m.modal === 'manual', rows: document.querySelectorAll('.mn-modal-body .controls-grid > div').length };
        m.closeModal();
        m.openModal('credits'); await frames(4);
        out.credits = { open: m.modal === 'credits',
                        sections: document.querySelectorAll('.mn-modal-body .mn-cred-sec').length,
                        rows: document.querySelectorAll('.mn-modal-body .mn-cred-row').length };
        m.closeModal();

        const pass = out.state === 'title'
          && out.press.stage === 'press' && out.press.pressVisible === true
          && out.press.menuVisible === false && out.press.wall === false
          && out.press.logos === 1
          && out.menu.stage === 'menu' && out.menu.menuVisible === true
          && out.menu.items >= 4 && out.menu.logos === 1 && out.menu.pressVisible === false
          && out.stillPressed === true && out.heldEase === 0
          && out.easeAtPress < 0.05 && out.beat.stage === 'dolly'
          && out.endEase > 0.2 && out.radiusDrop > 6
          && out.dollyMetres > 8
          && out.speedSamples > 20 && out.firstStep < 2 && out.maxStep < 3
          && out.manual.inTitle === false && out.manualModal.rows >= 10
          && out.credits.sections >= 5 && out.credits.rows >= 10;
        return { pass, detail: out };
      } finally { restoreStorage(snap); }
    })()`,
  },

  /* ===================================================================== */
  /* camera-feel-13 / audio-14 — settings survive a reload                   */
  /* ===================================================================== */
  {
    id: 'A72-settings-persist', kind: 'action', lane: 'shell-menus',
    title: 'Sensitivity 2× + invert Y + FOV survive a real page reload and reach input/player',
    settle: 900, timeout: 240000,
    /**
     * A GENUINE SECOND BOOT, not a re-read. The audit says "reload"; a gate
     * cannot navigate its own page without destroying the execution context
     * its assert lives in, so the reload happens in a same-origin IFRAME: the
     * whole game boots again — `Player`'s constructor seeding its `??=`
     * defaults onto a fresh `ctx.settings`, `installMenus` constructing a new
     * `SettingsStore` off the SAME localStorage — and the gate reads the
     * values out of that second context. That ordering is the thing worth
     * testing: a store that loaded before the defaults were seeded would be
     * silently clobbered by them and every number below would read 1.
     *
     * `?q=low` keeps the second renderer cheap; measured ~15 s on this box.
     */
    assert: `(async () => {${FRAMES}${STORAGE_GUARD}
      const snap = snapStorage();
      let frame = null;
      try {
        const c = __CTX__, m = c.menus;
        if (!m) return { pass: null, detail: 'SKIP: menus not installed' };
        const out = {};
        m.settings.set('sensitivity', 2);
        m.settings.set('invertY', true);
        m.settings.set('fov', 78);
        m.settings.set('vol_music', 0.34);
        out.stored = JSON.parse(localStorage.getItem('hzc.settings.v1') || 'null');
        out.live = { sens: c.settings.sensitivity, inv: c.settings.invertY, fov: c.settings.fov,
                     inputShares: c.input.settings === c.settings,
                     inputSens: c.input.opt('sensitivity'), inputInv: c.input.opt('invertY') };

        frame = document.createElement('iframe');
        frame.style.cssText = 'position:fixed;left:-4000px;top:0;width:640px;height:400px;border:0';
        frame.src = '/?shot=1&q=low';
        document.body.appendChild(frame);
        const t0 = performance.now();
        while (!frame.contentWindow?.__READY__ && performance.now() - t0 < 180000) await wait(250);
        out.bootMs = Math.round(performance.now() - t0);
        const w = frame.contentWindow;
        if (!w?.__READY__) return { pass: false, detail: { ...out, error: 'second boot never became READY' } };
        const t1 = performance.now();
        while (!w.__CTX__.menus && performance.now() - t1 < 25000) await wait(100);
        await wait(900);      // let its frame loop run so player.js has read the FOV

        const s = w.__CTX__.settings;
        out.reloaded = {
          menus: !!w.__CTX__.menus,
          restoredFromStore: w.__CTX__.menus?.settings?.audit?.().stored ?? null,
          sens: s.sensitivity, inv: s.invertY, fov: s.fov,
          inputShares: w.__CTX__.input.settings === s,
          inputSens: w.__CTX__.input.opt('sensitivity'),
          inputInv: w.__CTX__.input.opt('invertY'),
          playerFovBase: w.__CTX__.player.fovBase,
          music: w.__CTX__.audio?.volumes?.()?.music ?? null,
        };

        const r = out.reloaded;
        const pass = out.live.inputSens === 2 && out.live.inputInv === true
          && r.restoredFromStore === true
          && r.sens === 2 && r.inv === true && r.fov === 78
          && r.inputShares === true && r.inputSens === 2 && r.inputInv === true
          && Math.abs(r.playerFovBase - 78) < 0.01
          && (r.music === null || Math.abs(r.music - 0.34) < 0.02);
        return { pass, detail: out };
      } finally {
        try { frame?.remove(); } catch { /* already gone */ }
        restoreStorage(snap);
      }
    })()`,
  },

  /* ===================================================================== */
  /* missing-systems-accessibility                                          */
  /* ===================================================================== */
  {
    id: 'A72b-accessibility', kind: 'action', lane: 'shell-menus',
    title: 'HUD scale, colourblind palette, reduced motion and hold-crouch each land where they are read',
    settle: 900, timeout: 60000,
    /**
     * Each row is checked at its DESTINATION, never at the store: the HUD scale
     * on the variable `hud.css` reads, the palette on the computed
     * `--hzc-accent` every panel inherits, reduced motion on the body class the
     * animations are keyed to AND on the camera-shake value it is supposed to
     * zero, and hold-crouch by pressing and releasing C and watching
     * `player.crouching`.
     */
    assert: `(async () => {${FRAMES}${KEY}${STORAGE_GUARD}
      const snap = snapStorage();
      try {
        const c = __CTX__, m = c.menus;
        if (!m) return { pass: null, detail: 'SKIP: menus not installed' };
        const S = m.settings;
        const out = {};
        const hudRoot = c.hud?.rootEl ?? document.getElementById('hud');
        const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--hzc-accent').trim();

        out.accentBefore = accent();
        S.set('hudScale', 1.3); await frames(3);
        out.hudScale = { pref: getComputedStyle(document.documentElement).getPropertyValue('--hud-scale-pref').trim(),
                         onHud: hudRoot?.style.getPropertyValue('--hud-scale').trim() ?? '',
                         settings: c.settings.hudScale };
        S.set('colourblind', 'deuteranopia'); await frames(3);
        out.palette = { accent: accent(), changed: accent() !== out.accentBefore };
        S.set('reducedMotion', true); await frames(3);
        out.reduced = { body: document.body.classList.contains('hzc-reduced-motion'),
                        shake: c.settings.cameraShake, flag: c.settings.reducedMotion };

        // hold-vs-toggle, measured on the player
        const p = c.player;
        p.setCrouch?.(false);
        S.set('holdCrouch', 'toggle');
        key('KeyC'); await frames(3);
        const toggledOn = p.crouching;
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC', key: 'C', bubbles: true }));
        await frames(3);
        out.toggle = { after: p.crouching, stillCrouched: p.crouching === true && toggledOn === true };
        p.setCrouch?.(false);
        S.set('holdCrouch', 'hold');
        key('KeyC'); await frames(3);
        const heldOn = p.crouching;
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC', key: 'C', bubbles: true }));
        await frames(3);
        out.hold = { down: heldOn, afterRelease: p.crouching };

        // and every one of them is on disk for the next launch
        const raw = JSON.parse(localStorage.getItem('hzc.settings.v1') || '{}');
        out.persisted = { hudScale: raw.hudScale, colourblind: raw.colourblind,
                          reducedMotion: raw.reducedMotion, holdCrouch: raw.holdCrouch };

        S.reset();
        await frames(3);
        out.afterReset = { accent: accent(), body: document.body.classList.contains('hzc-reduced-motion') };

        const pass = out.hudScale.settings === 1.3 && out.hudScale.pref === '1.3'
          && out.hudScale.onHud !== ''
          && out.palette.changed === true
          && out.reduced.body === true && out.reduced.shake === 0 && out.reduced.flag === true
          && out.toggle.stillCrouched === true
          && out.hold.down === true && out.hold.afterRelease === false
          && out.persisted.hudScale === 1.3 && out.persisted.colourblind === 'deuteranopia'
          && out.persisted.reducedMotion === true && out.persisted.holdCrouch === 'hold'
          && out.afterReset.body === false;
        return { pass, detail: out };
      } finally { restoreStorage(snap); }
    })()`,
  },

  /* ===================================================================== */
  /* V38 — the shot the audit asks for                                      */
  /* ===================================================================== */
  {
    id: 'V38-title', kind: 'visual', lane: 'shell-menus',
    title: 'Title screen: one wordmark, a moving aerial vista, a vertical menu',
    plain: true, settle: 3400,
    /** Press a key so the PNG is the MENU, not the "press any key" beat. */
    setup: `window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));`,
    criteria: 'Exactly ONE HORIZON ZERO CLAUDE wordmark, with the terracotta spark cresting its rule. '
      + 'Behind it, the valley from the air — terrain, sky and the camp legible, not a flat gradient. '
      + 'A single vertical menu (CONTINUE / NEW GAME / SETTINGS / FIELD MANUAL / CREDITS) with CONTINUE '
      + 'greyed when there is no save, a save line under it, and a one-line tip. '
      + 'FAIL on: a second logo, the keybind wall, a "BEGIN THE HUNT" button beside the menu, '
      + 'or menu text that is unreadable against the vista.',
  },
];
