/**
 * Round 4 gates — lane `shell-hud` (docs/ROUND4-AUDIT.md §4, port 5214).
 *
 * Same contract as tools/gates.config.mjs: ACTION gates resolve
 * { pass, detail } in page context with __CTX__/__GAME__ available; a console
 * error during a gate is an automatic FAIL. VISUAL gates capture a PNG and are
 * graded against `criteria`.
 *
 * GATE IDS. Every id registered across tools/gates.config.mjs and
 * tools/gates.round4.*.mjs was checked before these were claimed. `A71` and
 * `V37` were both free, so they keep the audit's names unsuffixed. `A71b`
 * … `A71e` are new ids for the rest of the lane's §2 findings — the audit
 * gives this lane two gates but eleven findings, and the four extras are what
 * makes the other nine literal instead of asserted-by-screenshot. None of them
 * collides. Nothing here touches another lane's gate.
 *
 * WHY THE NUMBERS COME OUT OF `window.__HUD_DEBUG__`. The HUD is DOM, and the
 * only honest way to assert "the player can read their health" is to measure
 * the elements the browser actually laid out. `__HUD_DEBUG__.surfaces()` is a
 * read-only pass over the live nodes (`getComputedStyle` + client rects) built
 * in src/ui/hud.js — it reports what was drawn, it does not decide it. Nothing
 * in the game reads it.
 */

/** Page-context helper: N rendered frames, so the HUD's update() has run. */
/**
 * TIMEOUTS. These gates carry 150–180 s budgets, not the 45–60 s they were
 * written with. Nothing about what they assert changed: sixteen lanes run their
 * suites on this one box at once, and under that contention a page that boots in
 * 8 s quiet took 17 minutes — `A71e` failed the full run on `gate assert timeout`
 * having passed the same assertions twice in isolation (7.6 s, 24 s). A budget
 * that fails on the neighbour's load is measuring the box, not the HUD.
 */
const FRAMES = `
  const frames = async (n) => { for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r)); };`;

/**
 * Page-context helper: a living machine, the player planted ~13 m from it and
 * looking straight at it. The yaw convention is the one every other visual
 * gate in this repo uses (see V5/V6 in gates.config.mjs).
 */
const FACE_MACHINE = `
  const faceFrom = (m, dist) => {
    const p = __CTX__.player, mp = m.position;
    const a = Math.atan2(mp.x - p.position.x, mp.z - p.position.z);
    p.position.set(mp.x - Math.sin(a) * dist, 0, mp.z - Math.cos(a) * dist);
    p.velocity?.set?.(0, 0, 0);
    p._snapToGround?.();
    p.camYaw = a + Math.PI;
    p.camPitch = 0.1;
  };
  /**
   * Would the machine actually be IN the frame from the spot faceFrom() would
   * plant her on? The dead forest north of the camp is thick enough that a
   * Sawtooth 38 m out can sit entirely behind a trunk, and then the film shows
   * a projected plate hovering over nothing. ctx.collision.occluded() is the
   * spatial lane's published LOS test (docs/ROUND4-SPATIAL.md §2) — the same
   * one machine perception uses. No spatial lane -> old behaviour.
   */
  const clearShot = (m, dist) => {
    const C = __CTX__.collision;
    if (typeof C?.occluded !== 'function') return true;
    const p = __CTX__.player, mp = m.position;
    const a = Math.atan2(mp.x - p.position.x, mp.z - p.position.z);
    const V = p.position.constructor;
    const ex = mp.x - Math.sin(a) * dist, ez = mp.z - Math.cos(a) * dist;
    const eye = new V(ex, (__CTX__.terrain?.getHeight?.(ex, ez) ?? 0) + 1.65, ez);
    const chest = new V(mp.x, mp.y + (m.height ?? 2.2) * 0.55, mp.z);
    return !C.occluded(eye, chest);
  };
  /**
   * Species preference is about FRAMING, not about the assertions — every
   * check below is species-agnostic. A Watcher is 1.6 m tall and the valley's
   * tall grass is 1.5 m, so a Watcher at 13 m is a shape in the weeds and the
   * plate above its head is the only thing a judge can see. A Sawtooth clears
   * the grass line.
   */
  const pickMachine = async (kind, dist = 14) => {
    const list = __CTX__.machines?.list || [];
    const order = kind ? [kind] : ['sawtooth', 'strider', 'scrapper', 'watcher'];
    const alive = list.filter(x => x.alive !== false);
    const rank = (x) => { const i = order.indexOf(x.kind); return i < 0 ? order.length : i; };
    const cands = alive.slice().sort((a, b) => rank(a) - rank(b));
    // first candidate with an unobstructed line, else the old first-of-kind
    let m = cands.find(x => rank(x) < order.length && clearShot(x, dist))
         || cands.find(x => clearShot(x, dist))
         || cands[0] || null;
    if (!m) return null;
    faceFrom(m, dist);
    await frames(12);
    return m;
  };`;

/**
 * The `V37-hud-language` scenario, as the audit words it: "40 % HP, aiming,
 * machine engaged, tool slot populated". Every part of it goes through the
 * shipped path — `player.takeDamage` (emits `player-hurt`), the aim mouse bit
 * that `player.js` reads, and `machine.takeDamage` (emits `machine-damaged`,
 * which is what puts a projected bar over the machine).
 *
 * The one synthetic beat is the WEAK-POINT number. `machine.takeDamage`
 * decides `weak` itself from its own weak-point spheres, and on a Watcher that
 * sphere is a ~0.3 m eye that a gate cannot reliably land on across a rig
 * change. So the gate aims a real hit at the first enabled weak point AND, as
 * the belt, emits one `machine-damaged {weak:true}` on the event bus. That
 * event IS the published contract this lane renders (combat → shell-hud), so
 * measuring the size of the number it produces is measuring the shipped code.
 */
const COMBAT_SCENE = `
  __CTX__.input.enabled = true;
  const p = __CTX__.player;
  const m = await pickMachine(null, STAGE_DIST);   // each gate declares STAGE_DIST
  p.takeDamage(p.maxHealth * 0.6);                 // -> 40 % HP, real path
  __CTX__.input.mouse.buttons |= 4;                // aim
  await frames(10);
  __CTX__.input.mouse.buttons |= 1;                // draw
  if (m) {
    let mesh = null; m.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
    const V = p.position.constructor;
    const body = m.position.clone();
    body.y += (m.height ?? 2.2) * 0.55;
    const hit = (point, impact) => m.takeDamage({
      point, object: mesh, impact, tear: 0, element: 'none', elementAmount: 0,
      dir: { x: 0, y: 0, z: 1 }, type: 'hunter', baseDamage: impact,
    });
    hit(body, 24);
    await frames(20);
    const wp = (m.weakPoints || []).find(w => w.enabled !== false);
    if (wp) { const wpt = new V(); wp.obj.getWorldPosition(wpt); hit(wpt, 8); }
    __CTX__.events.emit('machine-damaged', {
      machine: m, damage: 11, weak: true, point: body,
      tear: 0, tornPart: null, triggeredElement: null,
    });
  }
  await frames(14);`;

export const GATES = [
  /* ------------------------------------------------------------------ ui-04 */
  {
    id: 'A71-compass-truth',
    kind: 'action',
    lane: 'shell-hud',
    title: 'Compass carries pips for Focus-tagged / quest machines only, not a radar sweep',
    timeout: 150000,
    settle: 1600,
    /**
     * ui-04. The old compass drew a pip for every machine in a 320 m radius —
     * a radar the player never earned. The rule now is: tagged, the tracked
     * quest's target, or actively fighting you. At spawn (24 machines, all on
     * patrol, nothing tagged) that has to be ZERO, and tagging exactly one
     * machine has to add exactly one.
     */
    assert: `(async () => {
      ${FRAMES}
      ${FACE_MACHINE}
      const hud = window.__HUD_DEBUG__;
      if (!hud) return { pass: false, detail: 'no window.__HUD_DEBUG__ — HUD did not build' };
      const focus = __CTX__.focus;
      if (!focus) return { pass: null, detail: 'SKIP: ctx.focus not installed' };

      await frames(8);
      const before = hud.compass();
      if (before.tagCount !== 0) {
        return { pass: false, detail: { why: 'gate precondition: something was already tagged', before } };
      }

      // Aim at a machine and tag it through the real key path's entry point.
      const m = await pickMachine(null);
      if (!m) return { pass: null, detail: 'SKIP: no living machine to tag' };
      focus.toggle(true);
      await frames(10);
      focus.tagTarget();
      await frames(8);
      const after = hud.compass();
      focus.toggle(false);
      await frames(4);

      const zeroed = before.machinePips === 0;
      const tagged = after.tagCount === 1;
      // "adds exactly one": the tagged machine is in front of the camera, so
      // its pip is inside the +/-70 deg window and must be the only one.
      const one = after.machinePips === 1;
      return {
        pass: zeroed && tagged && one,
        detail: {
          spawn: { machinePips: before.machinePips, tags: before.tagCount,
                   machinesAlive: before.machinesInWindow, hostile: before.hostile,
                   questPips: before.questPips },
          tagged: { machinePips: after.machinePips, tags: after.tagCount,
                    kind: m.kind },
          zeroed, taggedOne: tagged, addsExactlyOne: one,
        },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ ui-15 */
  {
    id: 'A71b-hud-scale-floor',
    kind: 'action',
    lane: 'shell-hud',
    title: 'HUD text never drops below the 11 px floor at any viewport or slider setting',
    timeout: 150000,
    settle: 1200,
    /**
     * ui-15 + camera-feel-13 (HUD side). The audit asked for
     * `--hud-scale: clamp(...)` with an 11 px floor and a Settings entry. The
     * clamp is in hud.js (a viewport RATIO cannot be expressed as a CSS
     * clamp), the FLOOR is in hud.css as `max(11px, calc(N px * var(--s)))`,
     * and `hud.setHudScale()` is what `shell-menus` binds its slider to.
     *
     * The runner pins every page at 1600x900 from node, so the viewports are
     * fed to the HUD through `__HUD_DEBUG__.simulateViewport()` — a debug-only
     * override of the two numbers `update()` reads from `window`. It drives
     * the same `_applyScale()` a real resize drives.
     */
    assert: `(async () => {
      ${FRAMES}
      ${FACE_MACHINE}
      const hud = window.__HUD_DEBUG__;
      const inst = __CTX__.hud;
      if (!hud?.simulateViewport) return { pass: false, detail: 'no __HUD_DEBUG__.simulateViewport' };
      if (typeof inst?.setHudScale !== 'function') {
        return { pass: false, detail: 'ctx.hud.setHudScale missing — shell-menus has nothing to bind' };
      }
      await frames(6);

      /**
       * FIX ROUND 2. Raise a REAL projected plate before sweeping, because the
       * probe list this gate grades used to contain nothing from the
       * world-projected layer — the one layer that is scaled by a transform
       * rather than by the stylesheet. It therefore graded the half of the HUD
       * that could not be scaled twice, and passed while .hzc-mhb-name
       * painted 7.7 px. A live bar makes the world probes read through an
       * ACTUAL transform, and plateW re-runs the judge's own measurement:
       * the painted plate must be 224 px times the world scale ONCE.
       */
      const m = await pickMachine(null, 24);
      if (m) {
        m.update = () => {};                       // freeze: page-local, gate only
        let mesh = null; m.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
        m.takeDamage({ point: m.position.clone(), object: mesh, impact: 18, tear: 0,
          element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 },
          type: 'hunter', baseDamage: 18 });
        await frames(10);
      }
      const read = (vp) => {
        const s = hud.surfaces(), a = s.scale;
        return { vp, scale: a.scale, world: a.worldScale,
          minFontPx: a.minFontPx, minEl: a.minFontEl, health: a.fonts.health,
          mhbName: a.fonts.mhbName ?? null, interact: a.fonts.interact ?? null,
          objDist: a.fonts.objDist ?? null,
          plateW: s.machineBars.widthPx[0] ?? null };
      };

      const sizes = [[1280, 720], [1600, 900], [1920, 1080], [2560, 1440], [3840, 2160]];
      const rows = [];
      for (const [w, h] of sizes) {
        hud.simulateViewport(w, h);
        await frames(3);
        rows.push(read(w + 'x' + h));
      }

      // The slider's own floor (0.7x) must still not produce unreadable type.
      hud.simulateViewport(1280, 720);
      inst.setHudScale(0.7);
      await frames(3);
      const low = read('slider0.7');

      // ... and its ceiling must not be silently ignored.
      inst.setHudScale(2);
      await frames(3);
      const high = read('slider2');

      inst.setHudScale(1);
      hud.simulateViewport();
      await frames(3);
      const restored = hud.scale();

      const all = rows.concat([low, high]);
      // minFontPx is now the EFFECTIVE size — the stylesheet px times every
      // transform between the element and the screen — over a probe list that
      // includes the world layer. 11 px is the floor for what was PAINTED.
      const floorOk = all.every(r => r.minFontPx >= 11);
      const worldFloorOk = all.every(r =>
        (r.mhbName == null || r.mhbName >= 11) &&
        (r.interact == null || r.interact >= 11) &&
        (r.objDist == null || r.objDist >= 11));
      // ONE multiplier: 224 px of CSS times the world scale, not its square.
      const plateSeen = all.filter(r => r.plateW != null);
      const singleScaled = plateSeen.length >= 5
        && plateSeen.every(r => Math.abs(r.plateW - 224 * r.world) <= 2);
      // s² painted a 224 px plate at 809 px on a 1600 px window — the
      // screen-spanning boss bar ui-06 exists to delete.
      const notABanner = plateSeen.every(r => r.plateW <= window.innerWidth * 0.35);
      const uhd = rows[rows.length - 1];
      const hd = rows[1];
      // 4K must be an actually BIGGER HUD, not the same pixels on 2.4x the screen.
      const uhdScales = uhd.health >= hd.health * 1.6;
      const sliderWorks = high.scale > low.scale + 0.3;
      const restoredOk = Math.abs(restored.vw - window.innerWidth) < 2
        && Math.abs(restored.scale - hd.scale) < 0.02;
      const failed = Object.entries({ floorOk, worldFloorOk, singleScaled, notABanner,
        uhdScales, sliderWorks, restoredOk }).filter(([, v]) => !v).map(([k]) => k);
      return {
        pass: failed.length === 0,
        detail: { failed, rows, low, high, platesSeen: plateSeen.length,
                  restored: { vw: restored.vw, scale: restored.scale } },
      };
    })()`,
  },

  /* ------------------- ui-06 / 07 / 08 / 11 / 12 / 19 + hit-feedback-faint */
  {
    id: 'A71c-hud-surfaces',
    kind: 'action',
    lane: 'shell-hud',
    title: 'Every V37 surface is on screen and correct: 4-segment red health + numerals, '
      + 'green pouch, projected machine bar, stealth eye, tools strip, XP bar, no kill feed',
    timeout: 180000,
    settle: 1600,
    /**
     * The measurable half of `V37-hud-language`, so the visual gate grades
     * COMPOSITION and this one grades EXISTENCE. It also closes the two
     * findings a screenshot cannot prove:
     *   ui-19  — the kill feed is DELETED (`killFeed === 0`), replaced by +XP
     *   combat-hit-feedback-faint — a weak-point number never renders < 18 px
     */
    assert: `(async () => {
      ${FRAMES}
      ${FACE_MACHINE}
      const hud = window.__HUD_DEBUG__;
      if (!hud) return { pass: false, detail: 'no window.__HUD_DEBUG__' };
      const STAGE_DIST = 14;
      ${COMBAT_SCENE}
      const s = hud.surfaces();

      /**
       * FIX ROUND 2 — ui-06 had no HORIZONTAL eye anywhere in this lane's
       * suite: only topPx. That is how a plate centred TWICE (a negative
       * half-width margin on top of a -50% translate) passed a whole round
       * while floating half its own width left of the machine, over empty
       * forest. maxOffAxisPx is the painted centre minus the anchor
       * re-projected from the machine itself, and it is graded at two
       * different HUD scales because the old error was proportional to scale
       * (-112 px at 1.0, -213 px at 1.9) and so invisible at any single one.
       * The machine is frozen and she is re-planted at 26 m so the plate is
       * comfortably clear of the melee clamp, which moves it on purpose.
       */
      const axis = [];
      if (m) {
        m.update = () => {};
        faceFrom(m, 26);
        await frames(6);
        for (const mult of [1, 1.6]) {
          __CTX__.hud.setHudScale(mult);
          await frames(5);
          const a = hud.surfaces();
          axis.push({ mult, scale: a.scale.scale, world: a.scale.worldScale,
            off: a.machineBars.maxOffAxisPx, plateW: a.machineBars.widthPx[0] ?? null,
            bar: a.machineBars.bars[0] ?? null });
        }
        __CTX__.hud.setHudScale(1);
        await frames(4);
      }

      const red = /(?:rgb|#)/.test(s.health.fillImage || '') && /207,\\s*59,\\s*50|cf3b32/i.test(s.health.fillImage || '');
      const green = /111,\\s*191,\\s*95/.test(s.pouch.color || '');
      const checks = {
        healthVisible: s.health.visible === true,
        healthSegments: s.health.segments === 4,
        healthNumerals: /^\\d+\\s*\\/\\s*\\d+$/.test(s.health.numerals.replace(/\\s+/g, ' ').trim()),
        healthRed: red,
        healthAt40: s.health.pct > 30 && s.health.pct < 50,
        pouchVisible: s.pouch.visible === true,
        pouchGreen: green,
        machineBar: s.machineBars.visible >= 1 && s.machineBars.visible <= s.machineBars.cap,
        stealthEye: s.eye.visible === true,
        toolsStrip: s.tools.visible === true && s.tools.slots >= 1,
        toolsUseKey: !!s.tools.useKey && s.tools.useKey.length <= 5,
        xpBar: s.xp.visible === true,
        weaponArt: s.weapon.visible === true && s.weapon.art === true,
        reticle: s.reticle.visible === true && s.reticle.aiming === true
          && s.reticle.brackets === true,
        noKillFeed: s.killFeed === 0,
        weakNumberFloor: s.damageNumbers.weakPx.length >= 1
          && s.damageNumbers.weakPx.every(px => px >= 18),
        fontFloor: s.scale.minFontPx >= 11,
        // ui-06: the plate sits OVER the machine, at every scale
        plateOnMachine: axis.length === 2 && axis.every(r => r.off != null && r.off < 8),
        plateSingleScaled: axis.length === 2
          && axis.every(r => r.plateW != null && Math.abs(r.plateW - 224 * r.world) <= 2),
      };
      const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
      return {
        pass: failed.length === 0,
        detail: {
          failed,
          health: s.health, pouch: s.pouch, bars: s.machineBars, eye: s.eye,
          tools: s.tools, xp: s.xp, weapon: s.weapon, reticle: s.reticle,
          damageNumbers: s.damageNumbers, killFeed: s.killFeed, minFontPx: s.scale.minFontPx,
          axis,
        },
      };
    })()`,
  },

  /* --------------------------- ui-19 / combat-concentration-presentation */
  {
    id: 'A71d-conc-veil',
    kind: 'action',
    lane: 'shell-hud',
    title: 'Concentration pulls a desaturate + cool-tint + vignette veil, and lets it go',
    timeout: 150000,
    settle: 1200,
    /**
     * combat-concentration-presentation. `combat` owns the gauge; this lane
     * owns what it LOOKS like. The veil ramps off `concentration-start` /
     * `-end` with a poll on `combat.concentration.active` as the belt, so the
     * gate drives the events (the published contract) and then checks that the
     * veil element is actually painting — opacity on both the saturation layer
     * and the tint layer, not just a class.
     */
    assert: `(async () => {
      ${FRAMES}
      const hud = window.__HUD_DEBUG__;
      if (!hud) return { pass: false, detail: 'no window.__HUD_DEBUG__' };
      const veilEl = document.getElementById('hzc-veil');
      if (!veilEl) return { pass: false, detail: 'no #hzc-veil element' };
      __CTX__.input.enabled = true;
      await frames(8);

      const off0 = hud.surfaces().concentration;
      __CTX__.events.emit('concentration-start', { gauge: 1 });
      await frames(40);                      // > the 0.22 s attack
      const on = hud.surfaces().concentration;
      const sat = parseFloat(getComputedStyle(veilEl.querySelector('.hzc-veil-sat')).opacity) || 0;
      const tint = parseFloat(getComputedStyle(veilEl.querySelector('.hzc-veil-tint')).opacity) || 0;
      const painting = getComputedStyle(veilEl).display !== 'none'
        && parseFloat(getComputedStyle(veilEl).opacity) > 0.05;

      __CTX__.events.emit('concentration-end', { gauge: 0 });
      await frames(60);                      // > the 0.34 s release
      const off1 = hud.surfaces().concentration;

      const checks = {
        startsClear: off0.veil < 0.05 && off0.on === false,
        ramps: on.veil > 0.9 && on.on === true,
        desaturates: sat > 0.3,
        tints: tint > 0.5,
        painting,
        releases: off1.veil < 0.05 && off1.on === false,
      };
      const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
      return { pass: failed.length === 0,
        detail: { failed, off0, on, sat: +sat.toFixed(3), tint: +tint.toFixed(3), off1 } };
    })()`,
  },

  /* ------------------------------------- ui-17 / onboarding tutorial cards */
  {
    id: 'A71e-tutorial-cards',
    kind: 'action',
    lane: 'shell-hud',
    title: 'Contextual tutorial cards fire once each, with real kbd glyphs, and never repeat',
    timeout: 150000,
    settle: 1400,
    /**
     * ui-17 / onboarding-loop-no-tutorial-hunt (HUD half — `progression` owns
     * the quest chain that teaches, this owns the card that says how). The
     * contract is ONE-SHOT: a card shows at most once per save, which means it
     * is persisted, which means a gate has to clear that store before it can
     * see one at all. `resetTips()` is the debug hook that does it.
     */
    assert: `(async () => {
      ${FRAMES}
      const hud = window.__HUD_DEBUG__;
      if (!hud?.resetTips) return { pass: false, detail: 'no __HUD_DEBUG__.resetTips' };
      __CTX__.input.enabled = true;
      hud.resetTips();
      await frames(6);

      const shown = hud.showTip('focus');
      await frames(30);
      const card = hud.surfaces().tip;
      const el = document.querySelector('.hzc-tip');
      const kbd = el ? el.querySelectorAll('kbd').length : 0;
      const kbdText = el ? [...el.querySelectorAll('kbd')].map(k => k.textContent) : [];
      const bodyPx = el
        ? Math.round(parseFloat(getComputedStyle(el.querySelector('.hzc-tip-body')).fontSize) || 0)
        : 0;

      // one-shot: asking for the same card again must be refused
      const again = hud.showTip('focus');

      /**
       * The PUBLISHED cross-lane surface: ctx.hud.showTip() plus the
       * tutorial-tip event. progression owns the "Lessons of the Valley"
       * chain and has to be able to raise a card for a mechanic this file
       * cannot observe — without editing this file. Both forms are one-shot on
       * the same store as the built-in cards.
       * (No backticks anywhere in here: this comment lives inside a template
       * literal, and one would end the gate body mid-sentence.)
       */
      const api = __CTX__.hud;
      const custom = typeof api?.showTip === 'function'
        ? api.showTip({ id: 'gate-custom', title: 'Gate card', body: 'published API', keys: ['F', 'E'] })
        : null;
      const customAgain = custom === null ? null
        : api.showTip({ id: 'gate-custom', title: 'Gate card', body: 'published API', keys: ['F', 'E'] });
      __CTX__.events.emit('tutorial-tip', { id: 'gate-event', title: 'Event card', body: 'event form', keys: ['J'] });
      const seen = hud.tips().seen;

      const checks = {
        queued: shown === true,
        visible: card.visible === true,
        titled: card.title.trim().length > 0,
        hasKbd: kbd >= 2,
        realGlyphs: kbdText.every(t => t && t.trim().length > 0 && t.length <= 5),
        readable: bodyPx >= 11,
        oneShot: again === false && seen.includes('focus'),
        publishedApi: custom === true && customAgain === false,
        eventForm: seen.includes('gate-event'),
      };
      const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
      return { pass: failed.length === 0,
        detail: { failed, card, kbd, kbdText, bodyPx, seen } };
    })()`,
  },

  /* ----------------------------------------------------------------- ui-16 */
  {
    id: 'A71f-interact-anchor',
    kind: 'action',
    lane: 'shell-hud',
    title: 'The [E] prompt is projected ONTO the interactable, never the screen-fixed fallback',
    timeout: 150000,
    settle: 1400,
    /**
     * ui-16 shipped as a no-op for a round: `_updateInteract` read the world
     * position off `interactables.current` itself, but the published record is
     * `{ entry, label, holdProgress }` — the position lives on `.entry`. The
     * projection branch therefore never ran and the prompt sat at the literal
     * fallback (vw/2, vh*0.66), i.e. exactly the screen-fixed prompt this
     * finding exists to delete. Nothing caught it because no gate looked at
     * the prompt at all.
     *
     * The trap this closes: standing her DEAD AHEAD of an interactable makes
     * the fallback and the truth agree to within a few px, so the gate plants
     * her OFF the crosshair axis (yawed ~40 deg, and the entry off to one
     * side). Then `fallbackWouldMiss` proves the assertion has teeth — the
     * projected point must be far from where the old code parked it — before
     * `anchored` grades the painted element against a fresh projection.
     */
    assert: `(async () => {
      ${FRAMES}
      const hud = window.__HUD_DEBUG__;
      if (!hud) return { pass: false, detail: 'no window.__HUD_DEBUG__' };
      const I = __CTX__.interactables;
      if (!I) return { pass: false, detail: 'no ctx.interactables' };
      __CTX__.input.enabled = true;
      const p = __CTX__.player;

      // nearest registered entry with a real world position (gather nodes,
      // crates, datapoints — whatever this world actually spawned)
      const live = (I.list || []).filter(e =>
        e && !e.removed && !e.consumed && !e.disabled
        && e.position && Number.isFinite(e.position.x));
      if (!live.length) return { pass: false, detail: 'no registered interactable in the world' };
      live.sort((a, b) => {
        const da = (a.position.x - p.position.x) ** 2 + (a.position.z - p.position.z) ** 2;
        const db = (b.position.x - p.position.x) ** 2 + (b.position.z - p.position.z) ** 2;
        return da - db;
      });
      const e = live[0];

      /**
       * Plant her 1.5 m from the entry (inside the 2.2 m default radius) on a
       * bearing 40 deg off where she will be looking, so the entry projects
       * well away from screen centre. camYaw points at the entry, then swings.
       */
      const toE = Math.atan2(e.position.x - p.position.x, e.position.z - p.position.z);
      const stand = toE + 0.72;                       // approach bearing
      p.position.set(e.position.x - Math.sin(stand) * 1.5, 0,
                     e.position.z - Math.cos(stand) * 1.5);
      p.velocity?.set?.(0, 0, 0);
      p._snapToGround?.();
      p.camYaw = stand + Math.PI + 0.70;              // look 40 deg off the entry
      p.camPitch = 0.05;
      await frames(24);

      const s = hud.surfaces();
      const it = s.interact;
      const vw = window.innerWidth, vh = window.innerHeight;
      // where the DELETED behaviour parked it — the prompt must not be there
      const fallback = [vw * 0.5, vh * 0.66];
      const fallbackWouldMiss = it.world
        ? Math.hypot(it.world[0] - fallback[0], it.world[1] - fallback[1]) > 60 : false;
      const notFallback = it.painted
        ? Math.hypot(it.painted[0] - fallback[0], it.painted[1] - fallback[1]) > 24 : false;

      const checks = {
        selected: it.current === true,
        promptVisible: it.visible === true,
        labelled: !!it.label && it.label.trim().length > 0,
        offAxisScenario: fallbackWouldMiss === true,
        anchored: it.anchored === true,
        withinTolerance: it.offsetPx != null && it.offsetPx < 24,
        notTheFallback: notFallback === true,
      };
      const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
      return { pass: failed.length === 0,
        detail: { failed, interact: it, fallback: fallback.map(Math.round),
          entry: { label: e.label ?? null,
            pos: [+e.position.x.toFixed(2), +e.position.y.toFixed(2), +e.position.z.toFixed(2)] } } };
    })()`,
  },

  /* -------------------------------- ui-05 / onboarding-objective-guidance */
  {
    id: 'A71g-tracker-live',
    kind: 'action',
    lane: 'shell-hud',
    title: 'The quest tracker is readable at full health and at boot, and survives the vitals hide',
    timeout: 150000,
    settle: 1600,
    /**
     * The tracker was built as a child of the vitals cluster, and the vitals'
     * 4 s full-health hide zeroed the shared parent's opacity — so the quest
     * text was invisible in every calm state, INCLUDING at boot (the idle
     * timer is seeded past threshold) and at the one moment it must appear:
     * the objective changing. The two timers are deliberately different
     * (4 s vs 26 s), so they cannot share an opacity.
     *
     * Graded on EFFECTIVE opacity — the product up the ancestor chain — not
     * the element's own class, which is what let the old parent hide it while
     * the audit still called it visible.
     */
    assert: `(async () => {
      ${FRAMES}
      const hud = window.__HUD_DEBUG__;
      if (!hud) return { pass: false, detail: 'no window.__HUD_DEBUG__' };
      __CTX__.input.enabled = true;
      const p = __CTX__.player;
      p.health = p.maxHealth;          // the calm state the tracker exists for
      await frames(6);

      // boot-adjacent read: full health, nothing hostile, no key held
      const atFull = hud.surfaces().tracker;

      // let the vitals' 4 s hide actually fire, then read again
      const t0 = performance.now();
      while (performance.now() - t0 < 5200) { p.health = p.maxHealth; await frames(4); }
      const afterHide = hud.surfaces();
      const vitalsHidden = afterHide.health.visible === false;

      // the moment it MUST be legible: the objective changes
      __CTX__.events.emit('quest-objective', {
        quest: 'gate', id: 'gate-obj', label: 'Gate objective', have: 0, need: 1,
      });
      await frames(20);
      const onChange = hud.surfaces().tracker;

      const checks = {
        hasText: (atFull.text || '').trim().length > 0 || (atFull.title || '').trim().length > 0,
        readableAtFullHealth: atFull.opacity > 0.9 && atFull.visible === true,
        vitalsStillHide: vitalsHidden === true,          // the hide itself is intact
        survivesVitalsHide: afterHide.tracker.opacity > 0.3
          && afterHide.tracker.visible === true,
        revealedOnObjective: onChange.opacity > 0.9 && onChange.visible === true,
      };
      const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
      return { pass: failed.length === 0,
        detail: { failed, atFull, afterHide: afterHide.tracker,
          vitals: afterHide.health.visible, onChange } };
    })()`,
  },

  /* --------------------------------------------------- ui-06, the melee clamp */
  {
    id: 'A71h-mhb-melee-clear',
    kind: 'action',
    lane: 'shell-hud',
    title: 'A clamped machine plate slides CLEAR of the vitals column and the stealth eye, '
      + 'and never pins to the top edge',
    timeout: 150000,
    settle: 1400,
    /**
     * The other half of the double-centre finding. `MHB_SAFE_L` exists to slide
     * a melee plate right of the quest tracker — but it was being applied to a
     * box that had already been shifted left by half its own width, so the
     * painted result was [132, 356] against a tracker at [28, 330]: the clamp
     * moved the plate INTO the thing it was written to avoid. Nothing measured
     * it, because the only horizontal number in the audit was the one the
     * renderer had just written.
     *
     * Everything here is read off painted rects: the plate's box against the
     * top-left column's box and the stealth eye's box, with the machine frozen
     * so the two reads describe the same world.
     */
    assert: `(async () => {
      ${FRAMES}
      ${FACE_MACHINE}
      const hud = window.__HUD_DEBUG__;
      if (!hud) return { pass: false, detail: 'no window.__HUD_DEBUG__' };
      __CTX__.input.enabled = true;
      const p = __CTX__.player;
      await frames(6);

      const m = await pickMachine(null, 3.2);        // melee range: anchor above the frame
      if (!m) return { pass: null, detail: 'SKIP: no living machine to stage' };
      m.update = () => {};                           // freeze: page-local, gate only
      let mesh = null; m.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
      m.takeDamage({ point: m.position.clone(), object: mesh, impact: 20, tear: 0,
        element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 },
        type: 'hunter', baseDamage: 20 });
      /**
       * Melee framing: the plate's anchor (head + 1.05 m) has to project ABOVE
       * the top of the frame, which is what the clamp exists for. Where that
       * happens depends on the machine's height and the camera rig, so the
       * gate finds it instead of asserting a magic pitch — and says so if no
       * framing produces the clamp at all, rather than passing an untested one.
       */
      let staged = false;
      for (const pitch of [0.1, 0.32, 0.55, 0.8]) {
        p.camPitch = pitch;
        await frames(8);
        const b = hud.surfaces().machineBars.bars[0];
        if (b && b.clamped) { staged = true; break; }
      }
      if (!staged) {
        return { pass: false, detail: { why: 'no camera framing pushed the plate anchor '
          + 'above the frame — the melee clamp never fired, so it is untested',
          bar: hud.surfaces().machineBars.bars[0] ?? null } };
      }
      await frames(4);

      const rows = [];
      for (const mult of [1, 1.6]) {
        __CTX__.hud.setHudScale(mult);
        await frames(6);
        const s = hud.surfaces();
        const bar = s.machineBars.bars[0] ?? null;
        rows.push({ mult, world: s.scale.worldScale, bar,
          column: s.machineBars.column, eye: s.eye.rect,
          track: s.tracker.rect, visible: s.machineBars.visible });
      }
      __CTX__.hud.setHudScale(1);
      await frames(4);

      const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
      const checks = {
        plateShown: rows.every(r => r.visible >= 1 && r.bar),
        clampFired: rows.every(r => r.bar && r.bar.clamped === true),
        clearsColumn: rows.every(r => r.bar && !overlaps(r.bar.rect, r.column)),
        clearsTracker: rows.every(r => r.bar && !overlaps(r.bar.rect, r.track)),
        clearsEye: rows.every(r => r.bar && !overlaps(r.bar.rect, r.eye)),
        // "below the compass ribbon", not pinned to the edge like a boss bar
        notOnTopEdge: rows.every(r => r.bar && r.bar.topPx > 60 * r.world),
        onScreen: rows.every(r => r.bar && r.bar.rect[2] < window.innerWidth
          && r.bar.rect[0] > 0),
      };
      const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
      return { pass: failed.length === 0, detail: { failed, rows } };
    })()`,
  },

  /* ------------------------------------------------------------------- V37 */
  {
    id: 'V37-hud-language',
    kind: 'visual',
    lane: 'shell-hud',
    title: 'HUD language at 40 % HP, aiming, machine engaged, tool slot populated',
    timeout: 180000,
    settle: 2600,
    setup: `(async () => {
      ${FRAMES}
      ${FACE_MACHINE}
      /**
       * A shot Sawtooth CHARGES at ~7 m/s, so an open stage distance is really
       * a statement about where the machine will be 2.6 s later, when the
       * shutter opens — 38 m was chosen to LAND at ~18 m, and it landed
       * wherever the charge and the dead forest agreed, which in the last film
       * was half behind a trunk at 30 m. Stage at the distance the HUD is
       * meant to be read at and FREEZE the machine there instead: the plate is
       * then photographed over a machine that is actually in the clear, which
       * is the whole point of the finding this film has to answer.
       * (Setup-only, page-local: no game code knows about it.)
       */
      const STAGE_DIST = 20;
      ${COMBAT_SCENE}
      if (m) { m.update = () => {}; faceFrom(m, 20); }
      // hold the vitals open: the dynamic HUD hides them after 4 calm seconds
      // and the shot is about whether they are LEGIBLE, not whether they hide.
      document.getElementById('hud').classList.add('reveal');
      if (m) {
        /**
         * Keep the camera on the machine until the shutter, the way a player
         * holding aim would, and hold her at the 40 % the audit specified —
         * otherwise the machine's own attacks decide what HP the film shows.
         * One more hit lands just before the capture so a damage number is
         * actually in the frame being judged.
         */
        // past the 2.6 s settle, not up to it: the last 150 ms is exactly long
        // enough for one Sawtooth swipe to decide what HP the film shows.
        const until = performance.now() + 4200;
        const hp40 = __CTX__.player.maxHealth * 0.4;
        const track = () => {
          if (performance.now() > until) return;
          const p = __CTX__.player;
          p.health = hp40;
          if (m.alive !== false) {
            const mp = m.position;
            p.camYaw = Math.atan2(mp.x - p.position.x, mp.z - p.position.z) + Math.PI;
          }
          requestAnimationFrame(track);
        };
        requestAnimationFrame(track);
        setTimeout(() => {
          const pt = m.position.clone(); pt.y += (m.height ?? 2.2) * 0.6;
          __CTX__.events.emit('machine-damaged', {
            machine: m, damage: 34, weak: true, point: pt,
            tear: 0, tornPart: null, triggeredElement: null,
          });
        }, 2150);
      }
    })()`,
    criteria:
      'Top-left: a RED health bar split into four segments by hairline ticks, filled to ~40 %, '
      + 'with HP numerals beside it, and a thinner GREEN medicine-pouch meter directly under it. '
      + 'Over the machine: a projected health plate with a backing plate, the machine name + LV, '
      + 'and an awareness cue — NOT a screen-edge boss bar. Under the compass: a stealth eye '
      + 'indicator. Bottom-left: a tools strip with at least one populated slot, a use-key glyph '
      + 'and cycle chevrons. Bottom-centre: an XP bar with a level pip. Bottom-right: a weapon '
      + 'panel with a BOW SILHOUETTE (not a text label), mod dots and an ammo count. Centre: '
      + 'corner-bracket reticle. Damage numbers read off-white/yellow and are large enough to read '
      + 'at a glance. FAIL on: a hairline single-segment health bar, a boss bar pinned to the '
      + 'screen edge, a text-only weapon widget, a kill-feed list, or any label small enough to '
      + 'squint at.',
  },
];
