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
   * Species preference is about FRAMING, not about the assertions — every
   * check below is species-agnostic. A Watcher is 1.6 m tall and the valley's
   * tall grass is 1.5 m, so a Watcher at 13 m is a shape in the weeds and the
   * plate above its head is the only thing a judge can see. A Sawtooth clears
   * the grass line.
   */
  const pickMachine = async (kind, dist = 14) => {
    const list = __CTX__.machines?.list || [];
    const order = kind ? [kind] : ['sawtooth', 'strider', 'scrapper', 'watcher'];
    let m = null;
    for (const k of order) { m = list.find(x => x.alive !== false && x.kind === k); if (m) break; }
    if (!m) m = list.find(x => x.alive !== false);
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
    timeout: 45000,
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
    timeout: 45000,
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
      const hud = window.__HUD_DEBUG__;
      const inst = __CTX__.hud;
      if (!hud?.simulateViewport) return { pass: false, detail: 'no __HUD_DEBUG__.simulateViewport' };
      if (typeof inst?.setHudScale !== 'function') {
        return { pass: false, detail: 'ctx.hud.setHudScale missing — shell-menus has nothing to bind' };
      }
      await frames(6);

      const sizes = [[1280, 720], [1600, 900], [1920, 1080], [2560, 1440], [3840, 2160]];
      const rows = [];
      for (const [w, h] of sizes) {
        hud.simulateViewport(w, h);
        await frames(3);
        const a = hud.scale();
        rows.push({ vp: w + 'x' + h, scale: a.scale, minFontPx: a.minFontPx, health: a.fonts.health });
      }

      // The slider's own floor (0.7x) must still not produce unreadable type.
      hud.simulateViewport(1280, 720);
      inst.setHudScale(0.7);
      await frames(3);
      const low = hud.scale();

      // ... and its ceiling must not be silently ignored.
      inst.setHudScale(2);
      await frames(3);
      const high = hud.scale();

      inst.setHudScale(1);
      hud.simulateViewport();
      await frames(3);
      const restored = hud.scale();

      const floorOk = rows.every(r => r.minFontPx >= 11) && low.minFontPx >= 11;
      const uhd = rows[rows.length - 1];
      const hd = rows[1];
      // 4K must be an actually BIGGER HUD, not the same pixels on 2.4x the screen.
      const uhdScales = uhd.health >= hd.health * 1.6;
      const sliderWorks = high.scale > low.scale + 0.3;
      const restoredOk = Math.abs(restored.vw - window.innerWidth) < 2
        && Math.abs(restored.scale - hd.scale) < 0.02;
      return {
        pass: floorOk && uhdScales && sliderWorks && restoredOk,
        detail: { rows, sliderMin: low.minFontPx, sliderMax: high.scale,
                  floorOk, uhdScales, sliderWorks, restoredOk,
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
    timeout: 60000,
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
      };
      const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
      return {
        pass: failed.length === 0,
        detail: {
          failed,
          health: s.health, pouch: s.pouch, bars: s.machineBars, eye: s.eye,
          tools: s.tools, xp: s.xp, weapon: s.weapon, reticle: s.reticle,
          damageNumbers: s.damageNumbers, killFeed: s.killFeed, minFontPx: s.scale.minFontPx,
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
    timeout: 45000,
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
    timeout: 45000,
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
      const seen = hud.tips().seen;

      const checks = {
        queued: shown === true,
        visible: card.visible === true,
        titled: card.title.trim().length > 0,
        hasKbd: kbd >= 2,
        realGlyphs: kbdText.every(t => t && t.trim().length > 0 && t.length <= 5),
        readable: bodyPx >= 11,
        oneShot: again === false && seen.includes('focus'),
      };
      const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
      return { pass: failed.length === 0,
        detail: { failed, card, kbd, kbdText, bodyPx, seen } };
    })()`,
  },

  /* ------------------------------------------------------------------- V37 */
  {
    id: 'V37-hud-language',
    kind: 'visual',
    lane: 'shell-hud',
    title: 'HUD language at 40 % HP, aiming, machine engaged, tool slot populated',
    timeout: 60000,
    settle: 2600,
    setup: `(async () => {
      ${FRAMES}
      ${FACE_MACHINE}
      /**
       * 38 m, not 14 or 24. A shot Sawtooth CHARGES at ~7 m/s, so the stage
       * distance is really a statement about where it will be 2.6 s later,
       * when the shutter opens. At 14 m it arrived at melee range and filled
       * the frame with its own flank, pushing its projected plate off the top
       * edge into the compass; at 24 m it still closed to 3 m. From 38 m it is
       * ~18 m out at the capture — the distance this HUD is designed to be
       * read at, with the whole machine and its plate in frame.
       */
      const STAGE_DIST = 38;
      ${COMBAT_SCENE}
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
