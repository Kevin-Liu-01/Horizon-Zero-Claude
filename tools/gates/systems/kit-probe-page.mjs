/**
 * M1.6j THE SLICE COMBAT KIT, LIVE: one scripted row per verb on its intended target, each with a number (BUILD M1.6j).
 * Run in the slice run's one Chrome session on the frames page (`slice-hour.mjs --kit`), after the frames:
 *
 *   steady        RMB held (aim), a real Shift press: the bow's sway (combat.sway, the angle the loosed shot leaves the
 *                 hairs by) read every frame for 7 s. Bar: sway exactly 0 for 4 s (3.9-4.1 s), then shake, and the world
 *                 clock at 1.0 throughout (no slow motion).
 *   bearing       the Alidade up on a Peg, a real T: one pip on the compass strip reading its bearing (within 1 deg),
 *                 0 marks drawn in the world; T on a second Peg replaces it (still one); T again lets it go.
 *   reed-peg      Reed arrows (Blunt) at a calm Peg's lamp: arrows to kill (bar 1).
 *   gauge-ballast a Reed arrow on a Gauge's ballast tank: its walk speed after / before (bar 0.60).
 *   reed-blunt    two Reed arrows on a standing Plumb's bob: the bob's tear taken (bar 0) and the body damage (> 0).
 *   vial-topple   Reed arrows at a Plumb's level vial: vial hits to topple (bar 2) and the seconds it stays down
 *                 (bar 4.0 +- 0.2).
 *   barbed-pry    one Barbed arrow (Pry) on the toppled Plumb's bob: arrows to take it (bar 1).
 *   lance-pry     a real E on a toppled Plumb's bob (the PRY prompt): the bob off in one hit (bar 1), ms from E.
 *   felling-blow  a real LMB lance swing on a toppled Plumb: the felling-blow event and its damage / max health.
 *   undercut      crouched behind a calm Plumb, a real E (the UNDERCUT prompt): killed in one blow (bar 1).
 *
 * Staged: the Instruments are spawned for the row by the machines system, calm (their brain switched off so the state
 * the row needs is the state the rule reads), 30 m from the cistern Brazier; Brea is placed. The shots are real arrows
 * (`combat._fire`: nock, ballistics, the hull sweep, the impact) with the aim point held over for the drop. The keys and
 * the mouse are real presses (puppeteer). Each row reports `pass` and its numbers.
 */

const PRELUDE = `
  const C = window.__CTX__, P = C.player, V = P.position.constructor;
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  const frames = async (n) => { for (let i = 0; i < n; i++) await raf(); };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const H = (x, z) => C.terrain.getHeight(x, z);
  const K = (window.__KIT ||= { staged: [], ev: [] });
  if (!K.hooked) {
    K.hooked = true;
    for (const n of ['arrow-hit', 'machine-damaged', 'plumb-topple', 'pry', 'felling-blow', 'undercut', 'weak-rule', 'machine-tagged', 'bearing-released'])
      C.events.on(n, (e) => K.ev.push({ n, t: performance.now(), s: C.engine?.simTime ?? null, m: e?.machine ?? null, vol: e?.volume ?? null, kind: e?.machine?.kind ?? null, pt: e?.point ? [Math.round(e.point.x * 100) / 100, Math.round(e.point.y * 100) / 100, Math.round(e.point.z * 100) / 100] : null, torn: e?.tornPart?.name ?? (typeof e?.torn === 'boolean' ? e.torn : null), dmg: e?.damage ?? null, tear: e?.tear ?? null, weak: !!e?.weak, rule: e?.rule ?? null, killed: !!e?.killed }));
  }
  const base = () => { const b = C.braziers?.byId?.('cistern'); return { x: (b?.obj?.position?.x ?? P.position.x) + 30, z: (b?.obj?.position?.z ?? P.position.z) + 12 }; };
  const face = (fx, fz, pitch = 0.05) => { P.camYaw = Math.atan2(-(fx - P.position.x), -(fz - P.position.z)); P.camPitch = pitch; P.heading = Math.atan2(fx - P.position.x, fz - P.position.z); };
  const place = (x, z, fx, fz) => { P.position.set(x, H(x, z) + 0.05, z); P.velocity?.set?.(0, 0, 0); P._snapToGround?.(); face(fx, fz); };
  const spawn = (kind, x, z) => {
    const m = C.machines.spawn(kind, x, z, {});
    if (!m) return null;
    if (m.ai) m.ai.tick = () => {};
    try { m.state = 'patrol'; m.suspicion = 0; } catch { /* */ }
    K.staged.push(m);
    return m;
  };
  const calm = (m) => { try { if (m.alive !== false && m.state !== 'downed' && !(m._toppleT >= 0)) { m.state = 'patrol'; } m.suspicion = 0; if (m.sc) m.sc.suspicion = 0; } catch { /* */ } };
  const wpos = (o) => o.getWorldPosition(new V());
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const raise = async () => { C.input.enabled = true; C.input.mouse.buttons |= 4; for (let i = 0; i < 90 && !(P.aiming && C.combat.nockLanded); i++) await raf(); await frames(8); return !!P.aiming; };
  const lower = async () => { C.input.mouse.buttons &= ~4; await frames(6); };
  /** one real arrow at world point pt (held over for the drop at full draw) */
  const shoot = async (ammo, pt, waitMs = 650, solve = true) => {
    const cb = C.combat;
    cb.setWeapon('sabina-bow', { silent: true });
    cb.selectAmmo('sabina-bow', ammo);
    cb.ammo[ammo] = Math.max(cb.ammo[ammo] ?? 0, 12);
    face(pt.x, pt.z, P.camPitch);
    cb.drawStrength = 1;
    const nock = new V(); cb.bow.getNockWorld(1, nock);
    const def = cb.ammoDefs?.[ammo] ?? cb.ammoDefs.hunter;
    const d = Math.hypot(pt.x - nock.x, pt.y - nock.y, pt.z - nock.z), tf = d / def.speed;
    /* round 2 fix: the aim point is solved on the game's own flight (combat._computeShot from the nock, arrows.gravity
     * and .drag at 60 Hz, the tip 0.78 m ahead of the tail) until the tip passes within 5 mm of pt; the flat holdover
     * (0.5 g tf^2) left the drag's drop and the launch's own lean out */
    const goal = new V(pt.x, pt.y + 0.5 * 9.8 * tf * tf, pt.z), dir = new V(), pos = new V(), vel = new V(), t0 = new V(), t1 = new V(), sg = new V();
    let missM = null;
    for (let it = 0; it < (solve ? 8 : 0); it++) {
      cb.aimPoint.copy(goal);
      const speed = cb._computeShot(def, 1, nock, dir);
      pos.copy(nock); vel.copy(dir).multiplyScalar(speed); t0.copy(pos).addScaledVector(dir, 0.78);
      let best = Infinity, bp = null;
      for (let s = 0; s < 150; s++) {
        vel.y -= cb.arrows.gravity / 60; vel.multiplyScalar(1 - cb.arrows.drag / 60); pos.addScaledVector(vel, 1 / 60);
        t1.copy(pos).addScaledVector(sg.copy(vel).normalize(), 0.78);
        sg.subVectors(t1, t0);
        const L2 = sg.lengthSq(), u = L2 > 1e-12 ? Math.max(0, Math.min(1, ((pt.x - t0.x) * sg.x + (pt.y - t0.y) * sg.y + (pt.z - t0.z) * sg.z) / L2)) : 0;
        const q = t0.clone().addScaledVector(sg, u), dd = q.distanceTo(pt);
        if (dd < best) { best = dd; bp = q; }
        t0.copy(t1);
        if (t1.distanceTo(nock) > d + 3) break;
      }
      missM = best;
      if (best < 0.005 || !bp) break;
      goal.sub(bp.sub(pt));
    }
    cb.aimPoint.copy(goal);
    K.lastMiss = missM;
    const n0 = K.ev.length;
    cb._fire();
    await wait(waitMs);
    return K.ev.slice(n0);
  };
`;

const ev = (code) => `(async () => { ${PRELUDE} ${code} })()`;

export async function runKit(page, { sleep, log = () => {} }) {
  const rows = {};
  const run = async (id, fn) => {
    const t0 = Date.now();
    try { rows[id] = await fn(); } catch (e) { rows[id] = { pass: false, error: String(e?.message || e).slice(0, 300) }; }
    rows[id].seconds = Math.round((Date.now() - t0) / 100) / 10;
    log(`kit ${id}: ${rows[id].pass ? 'PASS' : 'FAIL'} ${JSON.stringify(rows[id].num ?? rows[id].error ?? '')}`);
    try { await page.evaluate(ev(`for (const m of K.staged) { try { if (m.alive !== false) m.takeDamage({ impact: 1e7, tear: 0, point: null, object: null, dir: { x: 0, y: 0, z: 1 }, seen: true }); } catch { /* */ } } K.staged.length = 0; C.input.mouse.buttons = 0; if (P.crouching && P.toggleCrouch) P.toggleCrouch(false); await frames(4); return true;`)); } catch { /* */ }
    await page.keyboard.up('ShiftLeft').catch(() => {});
  };

  /* ---------------- steady ---------------- */
  await run('steady', async () => {
    await page.evaluate(ev(`const b = base(); place(b.x, b.z, b.x + 20, b.z); C.combat.steady.active = false; C.combat.steady.gauge = 1;
      const up = await raise(); K.samp = []; K.sampOn = true;
      const loop = () => { if (!K.sampOn) return; const c = C.combat; K.samp.push({ t: performance.now(), deg: c.sway.deg, ph: c.steady.phase, act: c.steady.active, g: c.steady.gauge, ts: C.engine?.timeScale ?? 1, aim: !!P.aiming }); requestAnimationFrame(loop); };
      requestAnimationFrame(loop); return up;`));
    await sleep(1500);
    await page.keyboard.down('ShiftLeft');
    await sleep(7000);
    await page.keyboard.up('ShiftLeft');
    return page.evaluate(ev(`K.sampOn = false; await lower();
      const S = K.samp, pre = S.filter((s) => !s.act && s.ph === 'out' && S.indexOf(s) < S.findIndex((q) => q.act));
      const i0 = S.findIndex((s) => s.act), iS = S.findIndex((s) => s.ph === 'shake'), iO = S.findIndex((s, i) => i > i0 && !s.act);
      const hold = i0 >= 0 ? S.slice(i0, iS >= 0 ? iS : S.length) : [];
      const shake = iS >= 0 ? S.slice(iS, iO >= 0 ? iO : S.length) : [];
      const holdS = i0 >= 0 && iS >= 0 ? (S[iS].t - S[i0].t) / 1000 : 0;
      const shakeS = iS >= 0 && iO >= 0 ? (S[iO].t - S[iS].t) / 1000 : 0;
      const num = { swayBeforeMaxDeg: r3(Math.max(0, ...pre.map((s) => s.deg))), holdS: r3(holdS), holdMaxDeg: hold.length ? Math.max(...hold.map((s) => s.deg)) : null,
        holdFrames: hold.length, shakeS: r3(shakeS), shakeMaxDeg: r3(Math.max(0, ...shake.map((s) => s.deg))), timeScaleMin: r3(Math.min(...S.map((s) => s.ts))), gaugeAtShake: iS >= 0 ? r3(S[iS].g) : null };
      return { num, pass: num.holdMaxDeg === 0 && num.holdS >= 3.9 && num.holdS <= 4.1 && num.shakeMaxDeg > 0.1 && num.timeScaleMin >= 0.999 && num.swayBeforeMaxDeg > 0.1,
        bar: 'sway exactly 0 for 4 s (3.9-4.1), then shake; world clock 1.0 throughout' };`));
  });

  /* ---------------- bearing ---------------- */
  await run('bearing', async () => {
    const pick = (which) => page.evaluate(ev(`
      const b = base();
      if (!K.pegs) { K.pegs = [spawn('peg', b.x + 16, b.z - 5), spawn('peg', b.x + 16, b.z + 7)]; place(b.x, b.z, b.x + 16, b.z); await frames(20); }
      const m = K.pegs[${which}];
      if (!C.sighting.on) C.sighting.toggle(true);
      for (let i = 0; i < 6; i++) { calm(m); const q = wpos(m.root || m.body); q.y += (m.height ?? 1) * 0.5; await window.__aimPoint(q.x, q.y, q.z, 0.3); await frames(3); }
      await frames(10);
      return { picked: (C.sighting._target ?? C.sighting._pickTarget?.()) === m };`));
    const read = (which) => page.evaluate(ev(`
      const m = K.pegs[${which}], tags = C.sighting.tags, hud = window.__HUD_DEBUG__?.compass?.();
      const flagPips = [...document.querySelectorAll('.cal-pip[data-k="flag"]')].filter((e) => e.style.visibility !== 'hidden');
      const lab = flagPips[0]?.querySelector('.cal-pip-dist')?.textContent ?? null;
      const brg = ((Math.atan2(m.position.x - P.position.x, -(m.position.z - P.position.z)) * 180 / Math.PI) + 360) % 360;
      return { tags: tags.size, held: tags.has(m), machinePips: hud?.machinePips ?? null, flagPips: flagPips.length,
        worldMarks: document.querySelectorAll('.calf-tag').length, label: lab, bearing: Math.round(brg) % 360 };`));
    const a = await pick(0);
    await page.keyboard.press('KeyT'); await sleep(400);
    const one = await read(0);
    const b = await pick(1);
    await page.keyboard.press('KeyT'); await sleep(400);
    const two = await read(1);
    await page.keyboard.press('KeyT'); await sleep(300);
    const off = await read(1);
    await page.evaluate(ev(`C.sighting.toggle(false); K.pegs = null; return 1;`));
    const lblOk = (r) => r.label != null && Math.abs(((Number(r.label) - r.bearing + 540) % 360) - 180) <= 1;
    const num = { first: one, second: two, released: { tags: off.tags, worldMarks: off.worldMarks }, picked: [a.picked, b.picked] };
    return { num, pass: one.tags === 1 && one.held && one.flagPips === 1 && one.worldMarks === 0 && lblOk(one)
      && two.tags === 1 && two.held && two.flagPips === 1 && two.worldMarks === 0 && lblOk(two) && off.tags === 0,
    bar: 'one pip with its bearing (within 1 deg), 0 marks drawn in the world; a second replaces it; T again lets it go' };
  });

  /* ---------------- reed-peg ---------------- */
  await run('reed-peg', () => page.evaluate(ev(`
    const b = base(); const m = spawn('peg', b.x + 12, b.z); place(b.x, b.z, b.x + 12, b.z); await frames(20); await raise();
    let n = 0; const hits = [];
    while (m.alive !== false && n < 3) { calm(m); const e = await shoot('hunter', wpos(m._lampWp.obj), 650, false); n++; hits.push(e.filter((x) => x.n === 'arrow-hit').map((x) => ({ weak: x.weak, dmg: x.dmg && Math.round(x.dmg) }))); }
    await lower();
    return { num: { arrowsToKill: m.alive === false ? n : null, hits }, pass: m.alive === false && n === 1, bar: 'one Reed arrow on the lamp kills a Peg' };`)));

  /* ---------------- gauge-ballast ---------------- */
  await run('gauge-ballast', () => page.evaluate(ev(`
    const b = base(); const m = spawn('gauge', b.x + 14, b.z + 2); await frames(30);
    const tank = (m.weakPoints || []).find((w) => w.name === 'ballast tank');
    if (!tank) return { pass: false, error: 'no ballast tank weak point' };
    const tp = wpos(tank.obj);
    const dx = tp.x - m.position.x, dz = tp.z - m.position.z, L = Math.hypot(dx, dz) || 1;
    place(tp.x + dx / L * 11, tp.z + dz / L * 11, tp.x, tp.z); await frames(10); await raise();
    const v0 = m.walkSpeed; let n = 0, rule = null;
    while (!m._punctured && n < 3) { const e = await shoot('hunter', wpos(tank.obj)); n++; rule = e.find((x) => x.n === 'weak-rule')?.rule ?? rule; }
    await lower();
    const k = m.walkSpeed / v0;
    return { num: { walkSpeedBefore: r3(v0), walkSpeedAfter: r3(m.walkSpeed), ratio: r3(k), arrows: n, rule }, pass: !!m._punctured && Math.abs(k - 0.6) < 0.005, bar: 'a ballast puncture: -40 % speed (ratio 0.60)' };`)));

  /* ---------------- plumb: reed-blunt, vial-topple, barbed-pry (one Plumb) ---------------- */
  await run('plumb-arrows', () => page.evaluate(ev(`
    // (eeddcb4: stood 11 m off along the lamp's axis, no arrow touched it at all: she stands where the Peg row stood, on
    // open ground, and the Plumb 24 m out)
    const b = base(); const m = spawn('plumb', b.x + 24, b.z); place(b.x, b.z, b.x + 24, b.z); await frames(30); await raise();
    const out = {};
    /* Blunt: two Reed arrows on the standing bob */
    const bob = m._bob; const hp0 = bob.tearHp, h0 = m.health; let struck = [];
    for (let i = 0; i < 2; i++) { calm(m); const e = await shoot('hunter', wpos(bob.mesh)); const h = e.find((x) => x.n === 'arrow-hit'); struck.push(e.find((x) => x.n === 'machine-damaged')?.vol ?? (h ? \`hit \${h.kind ?? 'world'}\` : 'no hit')); }
    out.blunt = { bobTearTaken: r3(hp0 - bob.tearHp), bodyDamage: r3(h0 - m.health), struck, bobOn: bob.attached !== false };
    /* the vial: Reed arrows until it topples */
    m.health = m.maxHealth;
    let n = 0, tTop = null, sTop = null; const vh = [];
    const vs = [];
    while (!(m._toppleT >= 0) && n < 8) { calm(m); const e = await shoot('hunter', wpos(m._vialWp.obj), 420); n++; vh.push(m._vialHits); const h = e.find((x) => x.n === 'arrow-hit'); vs.push(e.find((x) => x.n === 'machine-damaged')?.vol ?? (h ? \`hit \${h.kind ?? 'world'}\` : 'no hit')); const tp = e.find((x) => x.n === 'plumb-topple'); if (tp) { tTop = tp.t; sTop = tp.s; } }
    out.topple = { arrows: n, vialHitsSeq: vh, struck: vs, toppled: m._toppleT >= 0 };
    if (!(m._toppleT >= 0)) { await lower(); return { num: out, pass: false, error: 'never toppled' }; }
    tTop = tTop ?? performance.now();
    /* Pry: one Barbed arrow on the toppled bob */
    await frames(20);
    let nb = 0;
    const bs = [];
    while (bob.attached !== false && nb < 2 && m._toppleT >= 0) { const e = await shoot('hardpoint', wpos(bob.mesh), 300); nb++; const h = e.find((x) => x.n === 'arrow-hit'); bs.push(e.find((x) => x.n === 'machine-damaged')?.vol ?? (h ? \`hit \${h.kind ?? 'world'}\` : 'no hit')); }
    out.barbed = { arrows: nb, bobOff: bob.attached === false, downWhenTorn: m._toppleT >= 0, struck: bs };
    await lower();
    /* how long it stays down */
    const tl = performance.now();
    while (m._toppleT >= 0 && performance.now() - tl < 8000) await raf();
    out.topple.downS = r3((performance.now() - tTop) / 1000);
    out.topple.downSimS = sTop != null && C.engine?.simTime != null ? r3(C.engine.simTime - sTop) : null;
    const downS = out.topple.downSimS ?? out.topple.downS;
    const pass = { blunt: out.blunt.bobTearTaken === 0 && out.blunt.bodyDamage > 0, topple: m._vialHits === 0 && vh.filter((x, i) => i < vh.length - 1).every((x) => x <= 1) && Math.abs(downS - 4.0) <= 0.2, barbed: out.barbed.bobOff && out.barbed.arrows === 1 && out.barbed.downWhenTorn };
    return { num: out, pass: pass.blunt && pass.topple && pass.barbed, parts: pass,
      bar: 'Blunt: 0 tear on the bob, body damage > 0; the vial: topples on its 2nd vial hit, down 4.0 +- 0.2 s (simulation clock from the topple event); Barbed on the toppled bob: 1 arrow' };`)));

  /* ---------------- lance-pry (real E) ---------------- */
  await run('lance-pry', async () => {
    const st = await page.evaluate(ev(`
      const b = base(); const m = spawn('plumb', b.x + 10, b.z + 9); await frames(30); K.m = m;
      const vh = () => m.takeDamage({ point: wpos(m._vialWp.obj), object: null, impact: 1, tear: 0, element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: -1 }, type: 'arrow', seen: true });
      vh(); vh();
      if (!(m._toppleT >= 0)) return { error: 'staging: the vial rule did not topple it' };
      await frames(30);
      const bp = wpos(m._bob.mesh), dx = bp.x - m.position.x, dz = bp.z - m.position.z, L = Math.hypot(dx, dz) || 1;
      place(bp.x + dx / L * 1.7, bp.z + dz / L * 1.7, bp.x, bp.z);
      for (let i = 0; i < 40 && !C.combat.melee.pryTarget; i++) await raf();
      return { offered: !!C.combat.melee.pryTarget, part: C.combat.melee.pryTarget?.part?.name ?? null, label: C.combat.melee._pryE.label, t: performance.now() };`));
    if (st.error) return { pass: false, error: st.error };
    await page.keyboard.down('KeyE'); await sleep(450); await page.keyboard.up('KeyE');
    await sleep(1200);
    return page.evaluate(ev(`const m = K.m, pr = K.ev.filter((x) => x.n === 'pry' && x.m === m);
      const num = { offered: ${st.offered}, prompt: ${JSON.stringify(st.label)}, part: ${JSON.stringify(st.part)}, pries: pr.length, bobOff: m._bob.attached === false, msFromE: pr[0] ? Math.round(pr[0].t - ${st.t}) : null, stillDown: m._toppleT >= 0 };
      return { num, pass: num.offered && num.pries === 1 && num.bobOff, bar: 'E on the toppled Plumb (the PRY prompt) takes the bob in one hit' };`));
  });

  /* ---------------- felling-blow (real LMB) ---------------- */
  await run('felling-blow', async () => {
    const st = await page.evaluate(ev(`
      const b = base(); const m = spawn('plumb', b.x + 4, b.z - 10); await frames(30); K.m = m;
      const vh = () => m.takeDamage({ point: wpos(m._vialWp.obj), object: null, impact: 1, tear: 0, element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: -1 }, type: 'arrow', seen: true });
      vh(); vh(); await frames(30);
      if (!(m._toppleT >= 0)) return { error: 'staging: not toppled' };
      const c = wpos(m.body), dx = P.position.x - c.x, dz = P.position.z - c.z, L = Math.hypot(dx, dz) || 1;
      place(c.x + dx / L * 2.4, c.z + dz / L * 2.4, c.x, c.z); P.camPitch = 0.25; C.input.enabled = true; await frames(6);
      return { state: m.state, h0: m.health, max: m.maxHealth };`));
    if (st.error) return { pass: false, error: st.error };
    await page.mouse.move(800, 450);
    await page.mouse.down({ button: 'left' }); await sleep(120); await page.mouse.up({ button: 'left' });
    await sleep(1300);
    return page.evaluate(ev(`const m = K.m, fb = K.ev.filter((x) => x.n === 'felling-blow' && x.m === m);
      const num = { stateWhenSwung: ${JSON.stringify(st.state)}, fellingBlows: fb.length, damage: fb[0] ? Math.round(fb[0].dmg) : null, fracOfMax: fb[0] ? r3(fb[0].dmg / ${st.max}) : null };
      return { num, pass: fb.length >= 1 && fb[0].dmg > 0, bar: 'a lance swing on the toppled Plumb is a Felling blow (event, damage)' };`));
  });

  /* ---------------- undercut (real C, real E) ---------------- */
  await run('undercut', async () => {
    const st = await page.evaluate(ev(`
      const b = base(); const m = spawn('plumb', b.x - 6, b.z + 14); await frames(30); K.m = m; calm(m);
      const h = m.sc ? m.sc.heading : (m.heading ?? 0), r = (m.bodyRadius ?? 1) + 0.9;
      place(m.position.x - Math.sin(h) * r, m.position.z - Math.cos(h) * r, m.position.x, m.position.z);
      return { r };`));
    await page.keyboard.press('KeyC'); await sleep(500);
    const off = await page.evaluate(ev(`const m = K.m; for (let i = 0; i < 40 && C.combat.melee.undercutTarget !== m; i++) { calm(m); await raf(); } return { offered: C.combat.melee.undercutTarget === m, crouch: !!P.crouching, t: performance.now() };`));
    await page.keyboard.down('KeyE'); await sleep(700); await page.keyboard.up('KeyE');
    await sleep(1400);
    const res = await page.evaluate(ev(`const m = K.m, uc = K.ev.filter((x) => x.n === 'undercut' && x.m === m);
      const num = { offered: ${off.offered}, blows: uc.length, killed: m.alive === false, damage: uc[0] ? Math.round(uc[0].dmg) : null };
      return { num, pass: num.blows === 1 && num.killed, bar: 'crouched behind a calm Plumb: one Undercut kills it (sentry class)' };`));
    if (off.crouch) { await page.keyboard.press('KeyC'); await sleep(200); }
    res.num.crouched = off.crouch;
    return res;
  });

  /* ---------------- hit-feel (M1.3e) ---------------- */
  await run('hit-feel', () => page.evaluate(ev(`
    // a calm Plumb 20 m out on open ground; one Reed arrow on its body, then seven more 0.13 s apart (the 1 s budget)
    const b = base(); const m = spawn('plumb', b.x + 20, b.z); place(b.x, b.z, b.x + 20, b.z); await frames(40); await raise();
    const E = C.engine, cam = C.camera, cb = C.combat, env = C.environment;
    m.root.updateMatrixWorld(true);
    const aim = new V(m.position.x, m.position.y + 1.7, m.position.z);
    // the nodes sampled: the 10 nearest the aim point (bones and part nodes), so the struck one is among them
    const nodes = [];
    m.root.traverse((o) => { if (o !== m.root && (o.isBone || o.userData?.part)) nodes.push(o); });
    const wp = new V();
    nodes.sort((p, q) => p.getWorldPosition(wp).distanceTo(aim) - q.getWorldPosition(new V()).distanceTo(aim));
    const pick = nodes.slice(0, 10);
    let hull = null; m.root.traverse((o) => { if (!hull && o.isMesh && o.material?.userData?.hullU) hull = o; });
    const inv = new C.camera.matrixWorld.constructor(), mw = new C.camera.matrixWorld.constructor();
    const Q = C.camera.quaternion.constructor, q = new Q(), qr = new Q();
    const S = (window.__HF = []); let on = true;
    const tick = () => {
      if (!on) return;
      m.root.updateMatrixWorld(true);
      inv.copy(m.root.matrixWorld).invert();
      const ps = pick.map((o) => { mw.multiplyMatrices(inv, o.matrixWorld); const p = new V().setFromMatrixPosition(mw); q.setFromRotationMatrix(mw); return [p.x, p.y, p.z, q.x, q.y, q.z, q.w]; });
      S.push({ t: performance.now(), ts: E.timeScale ?? 1, fov: cam.fov, punch: cb._fovPunchOn ?? 0, flash: hull ? hull.material.userData.hullU.uFlash.value : null, light: env?.eyeLights?.[1]?.intensity ?? null, frame: E.frames, ps });
      calm(m);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await frames(30);
    /* one hit */
    const e1 = await shoot('hunter', aim, 700);
    const hit = e1.find((x) => x.n === 'machine-damaged') || e1.find((x) => x.n === 'arrow-hit');
    const tHit = hit ? hit.t : null;
    /* four more, 0.25 s apart: the freeze budget */
    const tB = performance.now();
    for (let i = 0; i < 7; i++) { calm(m); await shoot('hunter', aim, 130); }
    await wait(700);
    on = false;
    await lower();
    if (tHit == null) return { pass: false, error: 'the first arrow struck nothing', struck: e1.map((x) => x.n) };
    const hp = hit.pt ? new V(...hit.pt) : aim;
    // the struck node: the sampled node nearest the hit point at the hit
    const i0 = S.findIndex((s) => s.t >= tHit) - 1;
    const pre = S[Math.max(0, i0)];
    m.root.updateMatrixWorld(true);
    let ni = 0, nd = Infinity;
    pick.forEach((o, i) => { const d = o.getWorldPosition(new V()).distanceTo(hp); if (d < nd) { nd = d; ni = i; } });
    const dev = (s, r) => { const a = s.ps[ni], dx = a[0] - r[0], dy = a[1] - r[1], dz = a[2] - r[2]; const dot = Math.abs(a[3] * r[3] + a[4] * r[4] + a[5] * r[5] + a[6] * r[6]); return [Math.hypot(dx, dy, dz), 2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI]; };
    const r0 = pre.ps[ni];
    // its own idle motion over the 0.4 s before the hit (breath, fidgets): the noise a settle is judged against
    const idle = S.filter((s) => s.t < tHit && s.t >= tHit - 400).map((s) => dev(s, r0));
    const noiseM = Math.max(0, ...idle.map((x) => x[0])), noiseDeg = Math.max(0, ...idle.map((x) => x[1]));
    const in80 = S.filter((s) => s.t >= tHit && s.t <= tHit + 80).map((s) => dev(s, r0));
    const peakM = Math.max(0, ...in80.map((x) => x[0])), peakDeg = Math.max(0, ...in80.map((x) => x[1]));
    const after = S.filter((s) => s.t >= tHit && s.t < tB).map((s) => ({ dt: s.t - tHit, d: dev(s, r0) }));
    // settled: the first time from which it stays within its idle noise + 1 cm and + 1 deg until the next shot
    let settleMs = null;
    for (let i = 0; i < after.length; i++) { if (after.slice(i).every((a) => a.d[0] <= noiseM + 0.01 && a.d[1] <= noiseDeg + 1)) { settleMs = Math.round(after[i].dt); break; } }
    // the freezes: spans of frames under timeScale 0.5 (real ms), each run of them one freeze
    const runs = []; let cur = null;
    for (let i = 1; i < S.length; i++) { const fz = S[i - 1].ts < 0.5; if (fz) { if (!cur) cur = { s: S[i - 1].t, e: S[i].t }; else cur.e = S[i].t; } else if (cur) { runs.push(cur); cur = null; } }
    if (cur) runs.push(cur);
    const perHit = runs.map((r) => Math.round(r.e - r.s));
    let winMax = 0;
    for (const r of runs) { const w0 = r.s, w1 = w0 + 1000; let sum = 0; for (const x of runs) { const a = Math.max(x.s, w0), b2 = Math.min(x.e, w1); if (b2 > a) sum += b2 - a; } winMax = Math.max(winMax, sum); }
    // the FOV punch: the lens's offset (combat._fovPunchOn) and the lens itself against its value at the hit
    const fov0 = pre.fov;
    const punchMax = Math.max(0, ...S.map((s) => s.punch));
    const fovDev = Math.max(0, ...S.filter((s) => s.t >= tHit && s.t <= tHit + 400).map((s) => Math.abs(s.fov - fov0)));
    // the hull flash: rendered frames with the flash up after the first hit (before the burst)
    const flashFrames = new Set(S.filter((s) => s.t >= tHit && s.t < tB && s.flash > 0).map((s) => s.frame)).size;
    const lightMax = Math.max(0, ...S.filter((s) => s.t >= tHit && s.t < tHit + 200).map((s) => s.light ?? 0));
    const lightOffMs = (() => { const f = S.find((s) => s.t > tHit + 20 && (s.light ?? 0) === 0); return f ? Math.round(f.t - tHit) : null; })();
    const hf = cb.hitFeel?.last ?? null;
    const num = { struckNode: pick[ni].name || pick[ni].type, nodeFromHitM: r3(nd), vol: hit.vol ?? null, kick: hf?.kick ?? null,
      peakM: r3(peakM), peakDeg: r3(peakDeg), settleMs, idleNoiseM: r3(noiseM), idleNoiseDeg: r3(noiseDeg),
      freezeMs: perHit, freezeMaxMs: Math.max(0, ...perHit), freezeWindowMaxMs: Math.round(winMax), freezesGiven: (cb.hitFeel?.freezes ?? []).slice(-5).map((f) => Math.round(f.given * 1000)),
      punchMaxDeg: r3(punchMax), fovDevDeg: r3(fovDev), flashFrames, lightMax: r3(lightMax), lightOffMs, frames: S.length };
    const parts = { kick: (peakM >= 0.03 || peakDeg >= 4), settle: settleMs != null && settleMs <= 400, freeze: num.freezeMaxMs <= 120 && num.freezeWindowMaxMs <= 180 && perHit.length > 0,
      punch: punchMax > 0 && punchMax <= 2 && fovDev <= 2, flash: flashFrames >= 1 && flashFrames <= 3, light: lightMax > 0 };
    return { num, parts, pass: Object.values(parts).every(Boolean),
      bar: 'a struck part moves >= 3 cm or turns >= 4 deg within 80 ms and settles (back within its idle motion + 1 cm / 1 deg) within 400 ms; freeze <= 120 ms per hit and <= 180 ms in any 1 s; FOV punch <= 2 deg; flash <= 3 frames; an impact light' };`)));

  return rows;
}
