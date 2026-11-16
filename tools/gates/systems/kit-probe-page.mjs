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
  const spawn = (kind, x, z, still = false) => {
    const m = C.machines.spawn(kind, x, z, {});
    if (!m) return null;
    if (m.ai) m.ai.tick = () => {};
    try { m.state = 'patrol'; m.suspicion = 0; if (still) { m.__still = true; if (m.sc) m.sc._waitT = 1e6; } } catch { /* */ }
    K.staged.push(m);
    return m;
  };
  // M1b round 3: calm, and STILL for the rows that stage it (spawn(..., true): reed-peg, plumb-arrows): the patrol's own wait at a waypoint, held (machine.js _statePatrol: the speed decays to 0
  // and the route is not walked; a brain switched off alone left a Peg walking at 1.6-1.9 m/s and a Plumb's vial
  // moving 1.09 m a second, and the kit's arrows met the ground behind them)
  const calm = (m) => { try { if (m.alive !== false && m.state !== 'downed' && !(m._toppleT >= 0)) { m.state = 'patrol'; } m.suspicion = 0; if (m.sc) { m.sc.suspicion = 0; if (m.__still) m.sc._waitT = Math.max(m.sc._waitT ?? 0, 1e6); } } catch { /* */ } };
  const wpos = (o) => o.getWorldPosition(new V());
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const raise = async () => { C.input.enabled = true; C.input.mouse.buttons |= 4; for (let i = 0; i < 90 && !(P.aiming && C.combat.nockLanded); i++) await raf(); await frames(8); return !!P.aiming; };
  const lower = async () => { C.input.mouse.buttons &= ~4; await frames(6); };
  /** one real arrow at world point pt (held over for the drop at full draw) */
  const shoot = async (ammo, pt, waitMs = 650, solve = true, track = null) => {
    // M1b round 3: a staged Instrument with its brain off still walks and sways (the calm Plumb's vial moved 1.09 m in
    // a second at 3e04504, a Peg's lamp 0.18 m in a 0.2 s flight): the shot LEADS the target's own node, its velocity
    // read over 6 frames on the simulation clock, by the flight time to it (twice: the time depends on the lead)
    if (track) {
      const p0 = wpos(track), s0 = C.engine?.simTime ?? performance.now() / 1000;
      await frames(6);
      const p1 = wpos(track), s1 = C.engine?.simTime ?? performance.now() / 1000, dts = s1 - s0;
      const v = dts > 1e-3 ? p1.clone().sub(p0).multiplyScalar(1 / dts) : new V();
      const nk = new V(); C.combat.bow.getNockWorld(1, nk);
      const sp = (C.combat.ammoDefs?.[ammo] ?? C.combat.ammoDefs.hunter).speed;
      // the aimed point rides with the node (it may be a point ON the part, not its origin)
      const now = pt.clone().add(p1.clone().sub(p0));
      let aimAt = now.clone();
      for (let i = 0; i < 2; i++) { const tf = aimAt.distanceTo(nk) / (sp * 0.97); aimAt = now.clone().addScaledVector(v, tf); }
      K.lead = { v: [r3(v.x), r3(v.y), r3(v.z)], speed: r3(v.length()), by: r3(aimAt.distanceTo(pt)) };
      pt = aimAt;
    } else K.lead = null;
    aimFor(ammo, pt, solve);
    const n0 = K.ev.length;
    const AP = C.combat.arrows, flying = new Set(AP.list.filter((x) => x.mode === 'fly'));
    C.combat._fire();
    // M1b round 3 (reed-peg and plumb-arrows failing at 375c3ff: arrows the game's own flight says meet the part
    // struck nothing or the ground beyond): the arrow actually loosed, followed frame by frame: its launch against the
    // solve's, its closest approach to the point, how it ended, and the frames' clock
    const a = AP.list.find((x) => x.mode === 'fly' && !flying.has(x)) ?? null;
    const fl = a ? { p0: [r3(a.pos.x), r3(a.pos.y), r3(a.pos.z)], v0: [r3(a.vel.x), r3(a.vel.y), r3(a.vel.z)], dirDot: K.lastDir ? r3(a.vel.clone().normalize().dot(K.lastDir)) : null,
      near: Infinity, nearAge: null, frames: 0, ages: [], end: null } : { none: true };
    const tw = performance.now(), q = new V();
    let last = a ? a.pos.clone() : null;
    while (performance.now() - tw < waitMs) {
      await raf();
      if (!a || fl.end) continue;
      fl.frames++;
      if (fl.ages.length < 6) fl.ages.push(r3(a.age));
      // the closest approach of the tail's step to pt
      const d = new V().subVectors(a.pos, last), L2 = d.lengthSq();
      const u = L2 > 1e-12 ? Math.max(0, Math.min(1, q.subVectors(pt, last).dot(d) / L2)) : 0;
      const dd = q.copy(last).addScaledVector(d, u).distanceTo(pt);
      if (dd < fl.near) { fl.near = r3(dd); fl.nearAge = r3(a.age); if (track) { const tp = wpos(track); fl.targetMoved = r3(tp.distanceTo(pt)); fl.tailToTarget = r3(q.copy(last).addScaledVector(d, u).distanceTo(tp)); } }
      last.copy(a.pos);
      if (a.mode !== 'fly') fl.end = { mode: a.mode, at: [r3(a.pos.x), r3(a.pos.y), r3(a.pos.z)], on: a.stuckTo?.kind ?? a.stuckTo?.machine?.kind ?? null, age: r3(a.age) };
    }
    if (a && !fl.end) fl.end = { mode: a.mode, at: [r3(a.pos.x), r3(a.pos.y), r3(a.pos.z)], age: r3(a.age) };
    if (K.lead) fl.lead = K.lead;
    K.lastFlight = fl;
    return K.ev.slice(n0);
  };
  /**
   * fix round: of the points cand (world), the first whose flight (the game's own: arrows.predict from the nock, after
   * the same solve shoot makes) meets a part whose name matches re; null if none does. Nothing is fired.
   */
  const pickOn = (ammo, cand, re, max = 24) => {
    for (const q of cand.slice(0, max)) { aimFor(ammo, q, true); if (K.lastShot?.first && re.test(K.lastShot.first)) return q; }
    return null;
  };
  /** fix round: points over a part's meshes (its vertices drawn k of the way in toward their middle), nearest the middle first. */
  const pointsOn = (root, k = 0.35, per = 48) => {
    const c = new V(), out = []; let n = 0;
    root.updateMatrixWorld(true);
    root.traverse((o) => { const pa = o.isMesh && o.geometry?.attributes?.position; if (!pa) return; const st = Math.max(1, Math.floor(pa.count / per));
      for (let i = 0; i < pa.count; i += st) { const q = new V().fromBufferAttribute(pa, i); if (o.isSkinnedMesh && o.applyBoneTransform) o.applyBoneTransform(i, q); q.applyMatrix4(o.matrixWorld); out.push(q); c.add(q); n++; } });
    if (!n) return [wpos(root)];
    c.multiplyScalar(1 / n);
    return [c.clone(), ...out.map((q) => q.lerp(c, k)).sort((p, q) => p.distanceTo(c) - q.distanceTo(c))];
  };
  const aimFor = (ammo, pt, solve = true) => {
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
    // M1b diagnosis (6dda887: the Plumb rows' arrows struck the ground or nothing): what the game will loose now, read
    // with its own flight (arrows.predict on the engine's sub-step): the launch, the camera's agreement and first contact
    {
      const def2 = cb.ammoDefs?.[ammo] ?? cb.ammoDefs.hunter, d2 = new V(), cd = new V();
      const sp2 = cb._computeShot(def2, 1, nock, d2);
      K.lastDir = d2.clone();
      C.camera.getWorldDirection(cd);
      const st = C.engine?.steps || 1, pr = cb.arrows.predict?.(nock, d2, sp2, { dt: 1 / 60 / Math.max(1, st), aim: pt });
      K.lastShot = { nock: [r3(nock.x), r3(nock.y), r3(nock.z)], fromP: r3(nock.distanceTo(P.position)), camDot: r3(d2.dot(cd)),
        first: pr?.hit ?? null, firstKind: pr?.machine?.kind ?? null, predMissM: pr ? r3(pr.d) : null, solveMissM: missM != null ? r3(missM) : null };
    }
    return K.lastShot;
  };
`;

const ev = (code) => `(async () => { ${PRELUDE} ${code} })()`;

export async function runKit(page, { sleep, log = () => {}, only = null }) {
  const rows = {};
  const run = async (id, fn) => {
    if (only && !only.has(id)) return;
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
    // M1b round 3: the Peg stands still (spawn's still) and she stands 12 m in FRONT of its lamp, on dry ground, the shot on
    // a point of the lamp the game's own flight reaches first (pickOn): standing still, the Peg kept whatever way it had
    // turned, and at 5faec96 two arrows at the lamp's middle from behind its shoulder met its body (30 each, not weak)
    const b = base(); const m = spawn('peg', b.x + 12, b.z, true); await frames(30);
    const h = m.sc ? m.sc.heading : (m.heading ?? 0);
    let at = null;
    for (const da of [0, 0.5, -0.5, 1.0, -1.0]) { const x = m.position.x + Math.sin(h + da) * 12, z = m.position.z + Math.cos(h + da) * 12; if (H(x, z) > 0.3) { at = { x, z }; break; } }
    at = at ?? { x: b.x, z: b.z };
    place(at.x, at.z, m.position.x, m.position.z); await frames(10); await raise();
    let n = 0; const hits = [];
    const diag = [];
    while (m.alive !== false && n < 3) { calm(m); const lp = pickOn('hunter', pointsOn(m._lampWp.obj), /weak:lamp/) ?? wpos(m._lampWp.obj); const e = await shoot('hunter', lp, 650, true, m._lampWp.obj); n++; hits.push(e.filter((x) => x.n === 'arrow-hit').map((x) => ({ weak: x.weak, dmg: x.dmg && Math.round(x.dmg), kind: x.kind, pt: x.pt })));
      diag.push({ lamp: [r3(lp.x), r3(lp.y), r3(lp.z)], shot: K.lastShot, flight: K.lastFlight }); }
    await lower();
    return { num: { arrowsToKill: m.alive === false ? n : null, hits }, diag, pass: m.alive === false && n === 1, bar: 'one Reed arrow on the lamp kills a Peg' };`)));

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
    const b = base(); const m = spawn('plumb', b.x + 24, b.z, true); place(b.x, b.z, b.x + 24, b.z); await frames(30); await raise();
    const out = {};
    /* Blunt: two Reed arrows on the standing bob */
    const bob = m._bob; const hp0 = bob.tearHp, h0 = m.health; let struck = [];
    // how far the bob and the vial move standing calm (1 s of frames): what a 0.4 s flight has to lead
    { const s0 = [], s1 = []; for (let i = 0; i < 60; i++) { calm(m); s0.push(wpos(bob.mesh)); s1.push(wpos(m._vialWp.obj)); await raf(); }
      const span = (L) => { let mx = 0; for (const a of L) for (const b of L) mx = Math.max(mx, a.distanceTo(b)); return r3(mx); };
      K.motion = { bobSpan: span(s0), vialSpan: span(s1), rootSpeed: r3(m.speed ?? 0), state: m.state }; }
    const diag = [];
    for (let i = 0; i < 2; i++) { calm(m); const e = await shoot('hunter', wpos(bob.mesh), 650, true, bob.mesh); diag.push({ ...K.lastShot, hitPt: e.find((x) => x.n === 'arrow-hit')?.pt ?? null, flight: K.lastFlight }); const h = e.find((x) => x.n === 'arrow-hit'); struck.push(e.find((x) => x.n === 'machine-damaged')?.vol ?? (h ? \`hit \${h.kind ?? 'world'}\` : 'no hit')); }
    out.motion = K.motion; out.blunt = { bobTearTaken: r3(hp0 - bob.tearHp), bodyDamage: r3(h0 - m.health), struck, bobOn: bob.attached !== false, diag, bobAt: (() => { const q = wpos(bob.mesh); return [r3(q.x), r3(q.y), r3(q.z)]; })(), herAt: [r3(P.position.x), r3(P.position.y), r3(P.position.z)] };
    /* the vial: Reed arrows until it topples */
    m.health = m.maxHealth;
    let n = 0, tTop = null, sTop = null; const vh = [];
    const vs = [];
    const vd = [];
    while (!(m._toppleT >= 0) && n < 8) { calm(m); const e = await shoot('hunter', wpos(m._vialWp.obj), 700, true, m._vialWp.obj); n++; vh.push(m._vialHits); vd.push({ first: K.lastShot?.first ?? null, predMissM: K.lastShot?.predMissM ?? null, flight: K.lastFlight }); const h = e.find((x) => x.n === 'arrow-hit'); vs.push(e.find((x) => x.n === 'machine-damaged')?.vol ?? (h ? \`hit \${h.kind ?? 'world'}\` : 'no hit')); const tp = e.find((x) => x.n === 'plumb-topple'); if (tp) { tTop = tp.t; sTop = tp.s; } }
    out.topple = { arrows: n, vialHitsSeq: vh, struck: vs, toppled: m._toppleT >= 0, diag: vd };
    if (!(m._toppleT >= 0)) { await lower(); return { num: out, pass: false, error: 'never toppled' }; }
    tTop = tTop ?? performance.now();
    /* Pry: one Barbed arrow on the toppled bob */
    await frames(20);
    let nb = 0;
    const bs = [];
    // M1b: at the bob's middle and a little up its upper side (its mesh's origin is the top it hangs from; lying on the
    // ground, its lower side is behind the ground: bab1f0c struck the ground, then nothing)
    const cb0 = C.combat;
    const bobMid = (up) => { const c = new V(); let n = 0; bob.mesh.traverse((o) => { if (o.isMesh && o.geometry) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); c.add(o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld)); n++; } }); if (n) c.multiplyScalar(1 / n); else c.copy(wpos(bob.mesh)); c.y += up; return c; };
    // fix round: the point is one the game's own flight reaches first (pickOn over the bob's surface), and the row waits
    // for the arrow to land (Barbed flies 56 m/s: 24 m is 0.43 s, and bab1f0c waited 300 ms, so its second arrow left
    // before the first had landed)
    const picks = [];
    while (bob.attached !== false && nb < 2 && m._toppleT >= 0) {
      cb0.setWeapon('sabina-bow', { silent: true }); cb0.selectAmmo('sabina-bow', 'hardpoint'); cb0.ammo.hardpoint = Math.max(cb0.ammo.hardpoint ?? 0, 12);
      const q = pickOn('hardpoint', pointsOn(bob.mesh), /bob/i) ?? bobMid(0.07 * nb);
      picks.push({ at: [r3(q.x), r3(q.y), r3(q.z)], first: K.lastShot?.first ?? null, predMissM: K.lastShot?.predMissM ?? null });
      const e = await shoot('hardpoint', q, 900); nb++; const h = e.find((x) => x.n === 'arrow-hit'); bs.push(e.find((x) => x.n === 'machine-damaged')?.vol ?? (h ? \`hit \${h.kind ?? 'world'}\` : 'no hit'));
    }
    out.barbed = { arrows: nb, bobOff: bob.attached === false, downWhenTorn: m._toppleT >= 0, struck: bs, picks };
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
  /*
   * Fix round (the judge at 24419e9): the row measured a node 1.93 m from where the arrow struck (the gimbal's origin),
   * and that node's own idle motion (a fidget: 0.023 m / 10.3 deg in the 0.4 s before the hit) was larger than the
   * "kick". Now:
   *   - the STRUCK POINT itself is followed: the hit point, fixed in the frame of the part the hull names (the event's
   *     volume: part-<name> or rig_<bone>), read every rendered frame relative to the Instrument's root;
   *   - the staged Plumb's idle fidgets are held off for the row (gait._fidgetT; its brain is already off): the idle the
   *     settle is judged against is then its breath and look, measured over the 0.4 s before the hit and reported;
   *   - the burst (seven arrows 0.13 s apart) reports each arrow's hit and the freeze the hit-feel ledger gave it
   *     (combat.hitFeel.freezes), and the 1 s window is summed over both the sampled time scale and that ledger;
   *   - the lance is measured the same way (hit-feel-lance: a real LMB on a standing Plumb at 2.3 m).
   */
  const HF = `
    const hfStage = (m) => {
      const g = m.gait; if (g) { g._fidget = null; g._fidgetK = 0; g._fidgetT = 1e9; }
      const objs = [...new Set([...(m.rig?.spine ?? []), m.rig?.neck, m.rig?.head, ...(m.parts || []).map((p) => p.mesh)].filter(Boolean))];
      const hullMats = new Set(); m.root.traverse((o) => { if (o.isMesh) for (const mt of [].concat(o.material || [])) if (mt?.userData?.hullU?.uFlash) hullMats.add(mt); });
      const inv = new C.camera.matrixWorld.constructor(), rel = new C.camera.matrixWorld.constructor();
      const E = C.engine, cam = C.camera, cb = C.combat, env = C.environment;
      const S = []; const st = { on: true, S, objs };
      const tick = () => {
        if (!st.on) return;
        m.root.updateMatrixWorld(true);
        inv.copy(m.root.matrixWorld).invert();
        const ms = objs.map((o) => { rel.multiplyMatrices(inv, o.matrixWorld); return Array.from(rel.elements); });
        let fl = 0; for (const mt of hullMats) fl = Math.max(fl, mt.userData.hullU.uFlash.value || 0);
        S.push({ t: performance.now(), ts: E.timeScale ?? 1, fov: cam.fov, punch: cb._fovPunchOn ?? 0, flash: fl, light: env?.eyeLights?.[1]?.intensity ?? null, frame: E.frames, ms });
        calm(m); if (m.gait) m.gait._fidgetT = 1e9;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      return st;
    };
    const hfAnalyse = (st, m, hit, tHit, tEnd, t0row) => {
      const S = st.S, objs = st.objs, M4 = C.camera.matrixWorld.constructor, Q = C.camera.quaternion.constructor;
      const vol = hit.vol || '';
      let so = null;
      if (/^part-/.test(vol)) so = (m.parts || []).find((p) => 'part-' + p.name === vol)?.mesh ?? null;
      else if (/^rig_/.test(vol)) so = m.rig?.bones?.[vol.slice(4)] ?? null;
      const hp = hit.pt ? new V(...hit.pt) : null;
      let si = so ? objs.indexOf(so) : -1;
      const i0 = Math.max(0, S.findIndex((s) => s.t >= tHit) - 1), pre = S[i0];
      const mat = (s, i) => new M4().fromArray(s.ms[i]);
      m.root.updateMatrixWorld(true);
      const hpr = hp ? hp.clone().applyMatrix4(new M4().copy(m.root.matrixWorld).invert()) : null;
      if (si < 0 && hpr) { let bd = Infinity; objs.forEach((o, i) => { const d = new V().setFromMatrixPosition(mat(pre, i)).distanceTo(hpr); if (d < bd) { bd = d; si = i; } }); }
      if (si < 0 || !hpr) return { error: 'no struck part or point', vol };
      const lp = hpr.clone().applyMatrix4(mat(pre, si).invert());
      const q0 = new Q().setFromRotationMatrix(mat(pre, si)), q = new Q();
      const p0 = lp.clone().applyMatrix4(mat(pre, si));
      const dev = (s) => { const M = mat(s, si); const p = lp.clone().applyMatrix4(M); q.setFromRotationMatrix(M); return [p.distanceTo(p0), 2 * Math.acos(Math.min(1, Math.abs(q.dot(q0)))) * 180 / Math.PI]; };
      const idle = S.filter((s) => s.t < tHit && s.t >= tHit - 400).map(dev);
      const noiseM = Math.max(0, ...idle.map((x) => x[0])), noiseDeg = Math.max(0, ...idle.map((x) => x[1]));
      const in80 = S.filter((s) => s.t >= tHit && s.t <= tHit + 80).map(dev);
      const peakM = Math.max(0, ...in80.map((x) => x[0])), peakDeg = Math.max(0, ...in80.map((x) => x[1]));
      const after = S.filter((s) => s.t >= tHit && s.t < tEnd).map((s) => ({ dt: s.t - tHit, d: dev(s) }));
      let settleMs = null;
      for (let i = 0; i < after.length; i++) { if (after.slice(i).every((a) => a.d[0] <= noiseM + 0.01 && a.d[1] <= noiseDeg + 1)) { settleMs = Math.round(after[i].dt); break; } }
      const trace = after.filter((a, i) => i % 3 === 0).slice(0, 40).map((a) => [Math.round(a.dt), r3(a.d[0]), Math.round(a.d[1] * 10) / 10]);
      // the freezes: spans of frames under time scale 0.5 (real ms), each run one freeze
      const runs = []; let cur = null;
      for (let i = 1; i < S.length; i++) { const fz = S[i - 1].ts < 0.5; if (fz) { if (!cur) cur = { s: S[i - 1].t, e: S[i].t }; else cur.e = S[i].t; } else if (cur) { runs.push(cur); cur = null; } }
      if (cur) runs.push(cur);
      const win = (rs) => { let w = 0; for (const r of rs) { const a0 = r.s, a1 = a0 + 1000; let sum = 0; for (const x of rs) { const a = Math.max(x.s, a0), b = Math.min(x.e, a1); if (b > a) sum += b - a; } w = Math.max(w, sum); } return w; };
      const perHit = runs.map((r) => Math.round(r.e - r.s));
      const led = (C.combat.hitFeel?.freezes ?? []).filter((f) => f.s * 1000 >= t0row).map((f) => ({ s: f.s * 1000, e: f.e * 1000, asked: Math.round(f.asked * 1000), given: Math.round(f.given * 1000) }));
      const ledRuns = led.filter((f) => f.given > 0).map((f) => ({ s: f.s, e: f.s + f.given }));
      const fov0 = pre.fov;
      const punchMax = Math.max(0, ...S.filter((s) => s.t >= tHit).map((s) => s.punch));
      const fovDev = Math.max(0, ...S.filter((s) => s.t >= tHit && s.t <= tHit + 400).map((s) => Math.abs(s.fov - fov0)));
      const flashFrames = new Set(S.filter((s) => s.t >= tHit && s.t < tEnd && s.flash > 0).map((s) => s.frame)).size;
      const lightMax = Math.max(0, ...S.filter((s) => s.t >= tHit && s.t < tHit + 200).map((s) => s.light ?? 0));
      const lightOffMs = (() => { const f = S.find((s) => s.t > tHit + 20 && (s.light ?? 0) === 0); return f ? Math.round(f.t - tHit) : null; })();
      const node = objs[si];
      // the body above (the rig's head bone origin): what the gait's flinch moves when the struck part is a planted leg
      const hi = m.rig?.head ? objs.indexOf(m.rig.head) : -1;
      let body = null;
      if (hi >= 0) {
        const hp0 = new V().setFromMatrixPosition(mat(pre, hi)), hq0 = new Q().setFromRotationMatrix(mat(pre, hi)), hq = new Q();
        const bd = (s) => { const M = mat(s, hi); hq.setFromRotationMatrix(M); return [new V().setFromMatrixPosition(M).distanceTo(hp0), 2 * Math.acos(Math.min(1, Math.abs(hq.dot(hq0)))) * 180 / Math.PI]; };
        const bi = S.filter((s) => s.t < tHit && s.t >= tHit - 400).map(bd), b8 = S.filter((s) => s.t >= tHit && s.t <= tHit + 80).map(bd);
        body = { peakM: r3(Math.max(0, ...b8.map((x) => x[0]))), peakDeg: r3(Math.max(0, ...b8.map((x) => x[1]))), idleM: r3(Math.max(0, ...bi.map((x) => x[0]))), idleDeg: r3(Math.max(0, ...bi.map((x) => x[1]))) };
      }
      return { struck: node.name || node.type, vol, body, pointFromNodeM: r3(lp.length()), peakM: r3(peakM), peakDeg: r3(peakDeg), settleMs, idleNoiseM: r3(noiseM), idleNoiseDeg: r3(noiseDeg),
        peakOverIdle: r3(Math.max(peakM / Math.max(noiseM, 1e-4), peakDeg / Math.max(noiseDeg, 1e-3))), trace,
        freezeMs: perHit, freezeMaxMs: Math.max(0, ...perHit), freezeWindowMaxMs: Math.round(win(runs)), ledger: led.map((f) => ({ at: Math.round(f.s - tHit), asked: f.asked, given: f.given })),
        ledgerWindowMaxMs: Math.round(win(ledRuns)), ledgerMaxMs: Math.max(0, ...led.map((f) => f.given)),
        punchMaxDeg: r3(punchMax), fovDevDeg: r3(fovDev), flashFrames, lightMax: r3(lightMax), lightOffMs, frames: S.length, kick: C.combat.hitFeel?.last?.kick ?? null };
    };
    const hfParts = (n, { melee = false, burst = true } = {}) => ({
      kick: (n.peakM >= 0.03 || n.peakDeg >= 4) && (n.peakM > n.idleNoiseM + 0.01 || n.peakDeg > n.idleNoiseDeg + 1),
      settle: n.settleMs != null && n.settleMs <= 400,
      freeze: n.freezeMaxMs > 0 && n.freezeMaxMs <= 120 && n.freezeWindowMaxMs <= 180 && n.ledgerWindowMaxMs <= 180 && (!burst || n.burstHits >= 2),
      punch: n.punchMaxDeg > 0 && n.punchMaxDeg <= 2 && n.fovDevDeg <= 2,
      flash: n.flashFrames >= 1 && n.flashFrames <= 3,
      light: n.lightMax > 0,
    });
  `;

  await run('hit-feel', () => page.evaluate(ev(`${HF}
    // a calm Plumb 20 m out on open ground; one Reed arrow on its body, then seven more 0.13 s apart (the 1 s budget)
    const t0row = performance.now();
    const b = base(); const m = spawn('plumb', b.x + 20, b.z); place(b.x, b.z, b.x + 20, b.z); await frames(40); await raise();
    m.root.updateMatrixWorld(true);
    const chest = m.rig?.chest ?? m.rig?.head ?? null;
    const aim = chest ? chest.getWorldPosition(new V()) : new V(m.position.x, m.position.y + 0.75 * (m.height ?? 3.4), m.position.z);
    const st = hfStage(m);
    await frames(40);
    const e1 = await shoot('hunter', aim, 700);
    const d1 = K.lastShot;
    const hit = e1.find((x) => x.n === 'machine-damaged') || e1.find((x) => x.n === 'arrow-hit');
    const tB = performance.now();
    const burst = [];
    for (let i = 0; i < 7; i++) { calm(m); const e = await shoot('hunter', aim, 130); burst.push(e.filter((x) => x.n === 'machine-damaged' || x.n === 'arrow-hit').map((x) => x.n === 'machine-damaged' ? (x.vol || 'hull') : 'arrow-hit:' + (x.kind ?? 'world'))); }
    await wait(800);
    st.on = false;
    await lower();
    if (!hit) return { pass: false, error: 'the first arrow struck nothing', struck: e1.map((x) => x.n), shot: d1 };
    const num = hfAnalyse(st, m, hit, hit.t, tB, t0row);
    if (num.error) return { pass: false, error: num.error, num };
    num.burst = burst; num.burstHits = K.ev.filter((x) => x.n === 'machine-damaged' && x.m === m && x.t >= tB).length; num.shot = d1;
    const parts = hfParts(num);
    return { num, parts, pass: Object.values(parts).every(Boolean), staged: 'calm Plumb, brain off, idle fidgets held off for the row',
      bar: 'the struck point moves >= 3 cm or turns >= 4 deg within 80 ms, clear of its idle motion (+1 cm / +1 deg), and settles back within its idle motion + 1 cm / 1 deg within 400 ms; freeze <= 120 ms per hit and <= 180 ms in any 1 s (sampled and ledger, with >= 2 burst hits); FOV punch <= 2 deg; flash <= 3 frames; an impact light' };`)));

  /* ---------------- hit-feel-lance (M1.3e, F19's hit) ---------------- */
  await run('hit-feel-lance', async () => {
    const st0 = await page.evaluate(ev(`${HF}
      window.__HFL = null;
      const b = base(); const m = spawn('plumb', b.x + 6, b.z + 16); await frames(30); K.m = m; calm(m);
      const c = wpos(m.body || m.root), dx = P.position.x - c.x, dz = P.position.z - c.z, L = Math.hypot(dx, dz) || 1;
      place(c.x + dx / L * 2.3, c.z + dz / L * 2.3, c.x, c.z); P.camPitch = 0.1; C.input.enabled = true;
      await frames(20);
      window.__HFL = { st: hfStage(m), t0row: performance.now() };
      await frames(30);
      return { weapon: C.combat.activeWeapon?.id ?? null, d: r3(Math.hypot(P.position.x - c.x, P.position.z - c.z)) };`));
    await page.mouse.move(800, 450);
    await page.mouse.down({ button: 'left' }); await sleep(120); await page.mouse.up({ button: 'left' });
    await sleep(1600);
    return page.evaluate(ev(`${HF}
      const m = K.m, HL = window.__HFL; HL.st.on = false;
      const hit = K.ev.find((x) => x.n === 'machine-damaged' && x.m === m && x.t >= HL.t0row);
      if (!hit) return { pass: false, error: 'the swing struck nothing', staged: ${JSON.stringify(st0)}, evs: K.ev.filter((x) => x.t >= HL.t0row).map((x) => x.n) };
      const num = hfAnalyse(HL.st, m, hit, hit.t, performance.now(), HL.t0row);
      if (num.error) return { pass: false, error: num.error, num };
      num.staged = ${JSON.stringify(st0)}; num.damage = Math.round(hit.dmg ?? 0);
      const parts = hfParts(num, { melee: true, burst: false });
      return { num, parts, pass: Object.values(parts).every(Boolean), staged: 'calm standing Plumb at 2.3 m, brain off, idle fidgets held off; a real LMB',
        bar: 'as hit-feel, for one lance hit (the lance flashes its own hit)' };`));
  });


  return rows;
}
