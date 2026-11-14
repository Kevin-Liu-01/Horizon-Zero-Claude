/**
 * In-page staging for one Frame Set frame (run through puppeteer's page.evaluate, so each function
 * here is serialised on its own and may not touch anything outside its body).
 *
 *   stageFrame(frame, opts)  place Brea, set hour and weather, stage actors and pose, aim the lens,
 *                            freeze the simulation, measure the frame; returns what was staged and
 *                            every place where the build could not stage what the frame asks for
 *                            (`standIns`), so a baseline never pretends to be the target
 *   unstageFrame()           undo everything stageFrame did, in reverse order
 *
 * Reads only published contracts: ctx.props.gatePlaces, src/world/island/sites.js, ctx.people,
 * ctx.machines, ctx.menus, ctx.sighting, ctx.quickslots, environment.setTime/setWeather.
 *
 * Frame options read here beyond the camera/state basics (frameset.json):
 *   light: 'studio'      flat studio light: everything but Brea hidden, a neutral backdrop, a soft key
 *                        in her frame and an even fill, the environment's clock and sky stopped, no grade
 *   requires: [id]       content the frame needs; each id is probed (REQUIRES below) and a missing one
 *                        is recorded as a stand-in, never filmed as if it were there
 *   camera.lensAfterPose the pose is staged under the chase camera (an aim follows the game camera),
 *                        and the frame's own lens is put up only after the world is frozen
 */

export async function stageFrame(f, o = {}) {
  const C = window.__CTX__, E = C.engine, p = C.player, env = C.environment;
  const D2R = Math.PI / 180;
  const standIns = [];
  const undo = [];
  window.__frameUndo = undo;
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  const frames = async (n) => { for (let i = 0; i < n; i++) await raf(); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const withTimeout = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error(what + ' timed out')), ms))]);
  const V3 = C.camera.position.constructor;
  const S = await import('/src/world/island/sites.js');
  let SC = 1;
  try { SC = (await import('/src/world/island/extent.js')).ISLAND_SCALE ?? 1; } catch (e) { /* 1 */ }
  const ground = (x, z) => (C.terrain?.getHeight ? C.terrain.getHeight(x, z) : 0);
  const fwdOf = (bDeg) => ({ x: Math.sin(bDeg * D2R), z: -Math.cos(bDeg * D2R) });   // compass bearing -> engine xz

  /* ---- 0. a clean, playing, unfrozen start ---- */
  C.input.keys.clear(); C.input.mouse.buttons = 0; C.input.enabled = true;
  if (C.menus?.hubOpen) C.menus.closeHub(true);
  if (C.sighting?.on) C.sighting.toggle(false);
  if (C.state !== 'playing') C.state = 'playing';
  E.requestTimeScale('studio', null);

  /* ---- 1. where ---- */
  const GP = C.props?.gatePlaces || {};
  let rec = null, atName = typeof f.at === 'string' ? f.at : JSON.stringify(f.at);
  if (typeof f.at === 'object' && f.at?.en) rec = { x: f.at.en[0] * SC, z: -f.at.en[1] * SC };
  else if (f.at === 'rest') rec = { x: S.REST.x, z: S.REST.z };
  else if (f.at === 'fire') { const fp = C.settlements?.firePosition; rec = fp ? { x: fp.x, z: fp.z } : null; }
  else if (f.at?.startsWith('look.')) rec = GP.look?.[f.at.slice(5)] || null;
  else if (f.at?.startsWith('place:')) rec = GP[f.at.slice(6)] || null;
  else if (f.at?.startsWith('site:')) rec = S.siteById?.(f.at.slice(5)) || null;
  else if (f.at?.startsWith('trig:')) rec = (S.TRIG || []).find((t) => t.id === f.at.slice(5)) || null;
  if (!rec) { standIns.push(`no place ${atName} in this build: staged at REST`); rec = { x: S.REST.x, z: S.REST.z }; }
  let bx = rec.x, bz = rec.z;
  let B = f.bearing ?? rec.bearing ?? 0;
  if (f.approach) {
    const d = fwdOf(f.approach.bearing);
    bx = rec.x + d.x * f.approach.dist; bz = rec.z + d.z * f.approach.dist;
    B = (f.approach.bearing + 180) % 360;
  }
  const H = Math.PI - B * D2R;                                   // hero forward (sin H, cos H) == bearing B
  const fw = new V3(Math.sin(H), 0, Math.cos(H)), left = new V3(Math.cos(H), 0, -Math.sin(H));
  p.position.set(bx, 0, bz); p.velocity?.set?.(0, 0, 0); p._snapToGround?.();
  p.heading = H; p.camYaw = -B * D2R; p.camPitch = (f.camera?.pitch || 0) * D2R;

  /* ---- 1b. content the frame needs: a missing piece is a stand-in, named ---- */
  const REQUIRES = {
    'saltrow-buildings': () => ((C.settlements?.buildings?.length ?? C.settlements?.town?.buildings?.length ?? 0) > 0 ? null
      : 'Saltrow has no buildings in this build (the town is settlements W2): the frame shows the empty town ground'),
    'saltrow-lamps': () => ((C.settlements?.lamps?.length ?? C.settlements?.town?.lamps?.length ?? 0) > 0 ? null
      : 'no lit windows and no breakwater lamp in this build: the written lamp counts cannot be met'),
    breakwater: () => (GP.breakwater ? null : "no breakwater in this build: the lens stands on Saltrow's seaward edge"),
    'saltrow-ramp': () => (GP.saltrowRamp ? null : 'no ramp in this build: the lens stands seaward of Saltrow'),
  };
  for (const r of f.requires || []) { const why = REQUIRES[r] ? REQUIRES[r]() : `no probe for '${r}' in the filmer`; if (why) standIns.push(why); }

  /* ---- 2. when ---- */
  const states = env.weatherStates || [];
  const weather = states.includes(f.weather) ? f.weather : 'trade';
  if (weather !== f.weather) standIns.push(`no weather '${f.weather}' in this build: ${weather}`);
  const frozen0 = env.timeFrozen;
  env.timeFrozen = true; undo.push(() => { env.timeFrozen = frozen0; });
  env.setWeather(weather, 0);
  env.setTime(f.hour);
  try { E.setLookHour?.(f.hour, weather, null, { ev: false }); } catch (e) { /* older engine */ }

  /* ---- 3. who else is in frame: nothing roams unless the frame asks for the crowd ---- */
  const st = f.state || {};
  if (!st.crowd) {
    for (const m of C.machines?.list || []) if (m.root?.visible) { m.root.visible = false; undo.push(() => { m.root.visible = true; }); }
    for (const q of C.people?.list || []) if (q.group?.visible) { q.group.visible = false; undo.push(() => { q.group.visible = true; }); }
  }
  // page chrome: hidden unless the frame shows the HUD or a screen. display:none, not visibility: a child
  // that sets visibility: visible (the tutorial card's .show) paints through a hidden parent, which is how
  // the baseline's MOVE / SPRINT / BOW cards leaked into no-HUD frames. Only the game's own canvas stays.
  const gameCanvas = E.renderer?.domElement || null;
  const hideEl = (el) => { const d = el.style.display; el.style.display = 'none'; undo.push(() => { el.style.display = d; }); };
  const showChrome = !!st.hud || f.camera?.mode === 'screen';
  for (const el of Array.from(document.body.children)) {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el === gameCanvas || (gameCanvas && el.contains?.(gameCanvas))) continue;
    if (!showChrome) hideEl(el);
  }
  // a screen frame without the HUD (the title): the HUD layer and its tutorial card stay down too
  if (showChrome && !st.hud) { const hud = document.getElementById('hud'); if (hud) hideEl(hud); }
  // a tutorial card already queued must not land in a frame meant to have no HUD
  if (!st.hud && C.hud) {
    const q0 = C.hud._tipQueue ? C.hud._tipQueue.slice() : null;
    if (q0) { C.hud._tipQueue.length = 0; undo.push(() => { C.hud._tipQueue.push(...q0); }); }
    C.hud._dismissTip?.();
  }
  if (st.hud) { const hud = document.getElementById('hud'); if (hud?.classList.contains('hidden')) { hud.classList.remove('hidden'); undo.push(() => hud.classList.add('hidden')); } }
  if (st.hideKit && p.hero?.kit?.setHidden) { const h0 = p.hero.kit.hidden; p.hero.kit.setHidden(3); undo.push(() => p.hero.kit.setHidden(h0)); }

  /* ---- 3b. flat studio light (light: 'studio'): Brea alone on a neutral backdrop, not the island at noon ---- */
  let studioTick = null;
  if (f.light === 'studio') {
    await frames(2);   // the hour above lands once, then the environment's clock and sky stop
    const sc = C.scene, envUpd = env.update;
    env.update = function () {}; undo.push(() => { env.update = envUpd; });
    const bg0 = sc.background, envMap0 = sc.environment, envI0 = sc.environmentIntensity;
    const Col = env.hemi?.color?.constructor;   // THREE.Color, borrowed: a page.evaluate body cannot import 'three'
    if (Col) sc.background = new Col('#b4b1ab');
    sc.environmentIntensity = 0.35;
    undo.push(() => { sc.background = bg0; sc.environment = envMap0; sc.environmentIntensity = envI0; });
    if (sc.fog && 'density' in sc.fog) { const d0 = sc.fog.density; sc.fog.density = 0; undo.push(() => { sc.fog.density = d0; }); }
    // the even fill: the hemisphere at the hero sheets' neutral values (src/hero/sheets.js)
    const hemi = env.hemi;
    if (hemi) {
      const h0 = { c: hemi.color.getHex(), g: hemi.groundColor.getHex(), i: hemi.intensity };
      hemi.color.setHex(0xfff6e8); hemi.groundColor.setHex(0x8d8272); hemi.intensity = 1.15;
      undo.push(() => { hemi.color.setHex(h0.c); hemi.groundColor.setHex(h0.g); hemi.intensity = h0.i; });
    }
    // the soft key: white, from her front-left and above, fixed in HER frame so every turn of the orbit is lit alike
    const keyFrom = fw.clone().multiplyScalar(2.0).addScaledVector(left, 1.2).add(new V3(0, 2.2, 0)).normalize();
    const csm = E.csm || env.csm;
    if (csm?.lights) {
      const d0 = csm.lightDirection.clone();
      const l0 = csm.lights.map((l) => ({ l, c: l.color.getHex(), i: l.intensity }));
      csm.lightDirection.copy(keyFrom).negate();
      for (const r of l0) { r.l.color.setHex(0xffffff); r.l.intensity = 2.4; }
      undo.push(() => { csm.lightDirection.copy(d0); for (const r of l0) { r.l.color.setHex(r.c); r.l.intensity = r.i; } });
    } else if (env.sun) {
      const s0 = { c: env.sun.color.getHex(), i: env.sun.intensity, p: env.sun.position.clone() };
      env.sun.color.setHex(0xffffff); env.sun.intensity = 2.4; env.sun.position.copy(p.position).addScaledVector(keyFrom, 10);
      undo.push(() => { env.sun.color.setHex(s0.c); env.sun.intensity = s0.i; env.sun.position.copy(s0.p); });
    }
    for (const l of env.eyeLights || []) { const i0 = l.intensity; l.intensity = 0; undo.push(() => { l.intensity = i0; }); }
    if (env.fireLight) { const i0 = env.fireLight.intensity; env.fireLight.intensity = 0; undo.push(() => { env.fireLight.intensity = i0; }); }
    // no grade: the look's grade sets off, base exposure
    const L = E.look;
    if (L?.set) {
      const g0 = { ev: L.ev, gradeMix: L.gradeMix };
      E.setLook({ ev: 0, gradeMix: 0 });
      undo.push(() => E.setLook(g0));
    }
    // everything drawn that is not Brea (and what she carries) is hidden, and kept hidden every frame:
    // terrain chunks and scatter re-show themselves as the lens moves
    const heroRoot = p.model;
    const isHers = (o) => { for (let q = o; q; q = q.parent) if (q === heroRoot) return true; return false; };
    const hidden = new Set();
    studioTick = () => {
      sc.traverseVisible((o) => {
        if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && !hidden.has(o) && !isHers(o)) { o.visible = false; hidden.add(o); }
      });
    };
    studioTick();
    undo.push(() => { for (const o of hidden) o.visible = true; });
    standIns.push('flat studio light is the filmer\'s own stage (Brea alone, neutral backdrop) until the turntable exists (M0.13)');
  }

  /* ---- 4. actors, placed in Brea's frame ---- */
  const actors = [];
  for (const a of st.actors || []) {
    const ang = (a.side || 0) * D2R;
    const dir = fw.clone().multiplyScalar(Math.cos(ang)).addScaledVector(left, Math.sin(ang));
    const ax = bx + dir.x * a.dist, az = bz + dir.z * a.dist;
    if (a.type === 'person') {
      if (!C.people?.spawn) { standIns.push(`no people system: ${a.id} missing`); continue; }
      try {
        const q = await withTimeout(C.people.spawn(a.id, { x: ax, z: az, yaw: 0 }), 20000, 'person ' + a.id);
        q.setPosition?.(ax, az);
        // spawn() places a person in the bind pose (T-pose); stage() starts their script. A filmed person
        // stands in an idle clip from the moment it lands, and the settle below lets the mixer run it.
        const idle = q.spec?.clips?.idle || q.spec?.clips?.stage || ['Idle_Loop'];
        try { q.play?.(idle[0], { fade: 0, offset: 0.25 }); } catch (e) { standIns.push(`person ${a.id}: idle clip did not start (${e.message})`); }
        actors.push({ a, q, x: ax, z: az });
        undo.push(() => { try { C.people.despawn(q); } catch (e) { /* */ } });
      } catch (e) { standIns.push(`person ${a.id} not staged: ${e.message}`); }
    } else if (a.type === 'instrument') {
      const can = C.machines?.canSpawn ? C.machines.canSpawn(a.kind) : !!C.machines;
      if (!can) { standIns.push(`no Instrument kind '${a.kind}' in this build`); continue; }
      const m = C.machines.spawn(a.kind, ax, az, { route: [{ x: ax, z: az }], heading: 0 });
      if (!m) { standIns.push(`Instrument '${a.kind}' did not spawn`); continue; }
      actors.push({ a, m, x: ax, z: az });
      undo.push(() => {
        const L = C.machines.list, i = L.indexOf(m);
        if (i >= 0) L.splice(i, 1);
        try { m.dispose?.(); } catch (e) { /* */ }
        m.root?.parent?.remove(m.root);
      });
      if (a.state === 'topple') standIns.push(`Instrument '${a.kind}': no topple state yet, filmed standing`);
      if (a.standInFor) standIns.push(`a ${a.kind} stands in for ${a.standInFor}`);
    }
  }

  /* ---- 5. the lens ---- */
  const cam = C.camera, fov0 = cam.fov;
  undo.push(() => { cam.fov = fov0; cam.updateProjectionMatrix(); });
  const mode = f.camera?.mode || 'chase';
  const lens = { pos: new V3(), tgt: new V3() };
  const head = () => {
    const b = p.animator?.b?.head?.bone;
    if (b) return b.getWorldPosition(new V3());
    return new V3(p.position.x, p.position.y + 1.6, p.position.z);
  };
  const aim = () => {
    const P0 = p.position, c = f.camera;
    if (mode === 'orbit') {
      const t = (c.yawRel || 0) * D2R;
      const d = fw.clone().multiplyScalar(Math.cos(t)).addScaledVector(left, Math.sin(t));
      if (c.target === 'head') { const hp = head(); lens.tgt.copy(hp); lens.pos.copy(hp).addScaledVector(d, c.dist); }
      else {
        if (c.target && typeof c.target === 'object') lens.tgt.copy(P0).addScaledVector(fw, c.target.fwd || 0).addScaledVector(left, c.target.side || 0).add(new V3(0, c.target.up ?? 1, 0));
        else lens.tgt.set(P0.x, P0.y + 0.95, P0.z);
        lens.pos.set(P0.x + d.x * c.dist, P0.y + (c.height ?? 1.2), P0.z + d.z * c.dist);
      }
    } else if (mode === 'pov') {
      lens.pos.set(P0.x, P0.y + (c.eye ?? 1.6), P0.z);
      lens.tgt.copy(lens.pos).addScaledVector(fw, 10).add(new V3(0, Math.tan((c.pitch || 0) * D2R) * 10, 0));
    } else if (mode === 'eye') {
      const d = fwdOf(f.bearing ?? 0);
      lens.pos.set(rec.x, ground(rec.x, rec.z) + (c.eye ?? 1.7), rec.z);
      lens.tgt.set(lens.pos.x + d.x * 100, lens.pos.y + Math.tan((c.pitch || 0) * D2R) * 100, lens.pos.z + d.z * 100);
    }
    cam.position.copy(lens.pos); cam.lookAt(lens.tgt);
    if (c.fov && cam.fov !== c.fov) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  };
  const upd0 = p._updateCamera;
  undo.push(() => { p._updateCamera = upd0; });
  const pitchR = (f.camera?.pitch || 0) * D2R;
  const chaseCam = function (dt, t) { p.camYaw = -B * D2R; p.camPitch = (mode === 'chase' || mode === 'screen') ? pitchR : 0; if (st.pose !== 'run') p.heading = H; const r = upd0.call(this, dt, t); if (studioTick) studioTick(); return r; };
  const ownLens = function () { if (st.pose !== 'run') p.heading = H; aim(); if (studioTick) studioTick(); };
  // an aim follows the game camera, so a side-on draw is staged behind her and the side lens goes up frozen
  const lateLens = !!f.camera?.lensAfterPose && mode !== 'chase' && mode !== 'screen';
  p._updateCamera = (mode === 'chase' || mode === 'screen' || lateLens) ? chaseCam : ownLens;
  if (mode === 'eye' || mode === 'pov') {
    if (f.camera.hideHero !== false && p.model) { const v = p.model.visible; p.model.visible = false; undo.push(() => { p.model.visible = v; }); }
  }

  /* ---- 6. settle: streaming, idle, actors land ---- */
  await sleep(o.settleMs ?? 2600);
  for (const r of actors) {
    if (r.m) {   // an Instrument stands still where it was put, facing Brea
      const want = Math.atan2(bx - r.x, bz - r.z);
      r.m.heading = want; if (r.m.root) { r.m.root.position.set(r.x, ground(r.x, r.z), r.z); }
      const u0 = r.m.update; r.m.update = function () {}; undo.push(() => { r.m.update = u0; });
    } else if (r.q) {
      const tx = r.a.face === 'camera' ? lens.pos.x : bx, tz = r.a.face === 'camera' ? lens.pos.z : bz;
      const want = Math.atan2(tx - r.x, tz - r.z);
      r.q.stopWalk?.(); r.q.yaw = want; if (r.q.group) r.q.group.rotation.y = want;
      if (!r.q.current) standIns.push(`person ${r.a.id}: no clip playing when filmed (bind pose)`);
    }
  }

  /* ---- 7. pose ---- */
  const press = (code) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code })); window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code })); };
  const pose = st.pose || 'idle';
  undo.push(() => { C.input.keys.clear(); C.input.mouse.buttons = 0; if (p.crouching) p.setCrouch?.(false); });
  if (pose === 'run') {
    C.input.keys.add('KeyW'); C.input.keys.add('ShiftLeft'); await sleep(1600);
  } else if (pose === 'draw' || pose === 'crouchAim') {
    if (C.quickslots?.select) C.quickslots.select(1); else press('Digit1');
    await sleep(350);
    if (pose === 'crouchAim') { p.setCrouch?.(true); await sleep(300); }
    C.input.mouse.buttons |= 4; await sleep(450);
    C.input.mouse.buttons |= 1;
    if (pose === 'crouchAim') C.input.keys.add('KeyD');
    await sleep(1300);
    if (!p.aiming) standIns.push(`pose ${pose}: the aim did not engage`);
  } else if (pose === 'crouch') {
    p.setCrouch?.(true); await sleep(900);
    if (!p.crouching) standIns.push('pose crouch: crouch did not engage');
  } else if (pose === 'lanceHeavy') {
    if (C.quickslots?.select) C.quickslots.select(2); else press('Digit2');
    await sleep(900);
    C.input.mouse.buttons |= 1; await sleep(700); C.input.mouse.buttons &= ~1; await sleep(260);
    standIns.push('pose lanceHeavy: a held strike filmed at a fixed 0.26 s after release; contact is not detected yet');
  } else if (pose === 'sit') {
    standIns.push('pose sit: no seated pose yet, filmed idle');
  }

  /* ---- 8. screens ---- */
  if (mode === 'screen') {
    const s = f.camera.screen;
    if (s === 'title') {
      if (C.menus?.quitToTitle) {
        C.menus.quitToTitle(); await sleep(3200);
        if (C.menus.titleStage === 'press') { C.menus._titleAdvance?.(); await sleep(2600); }
      } else standIns.push('no title flow in this build');
    } else if (s === 'sighting') {
      if (C.sighting?.toggle) {
        C.sighting.toggle(true); undo.push(() => C.sighting.toggle(false));
        // the card shows after the crosshair dwells on an Instrument (0.4 s): wait for it, up to 6 s
        const cardUp = () => !!(C.sighting.audit?.().cardVisible ?? C.sighting._card?.classList.contains('show'));
        const t0 = performance.now();
        await sleep(1800);
        while (!cardUp() && performance.now() - t0 < 6000) await sleep(200);
        if (!cardUp()) standIns.push(`Sighting raised but no card: nothing the alidade reads is under the crosshair (target ${C.sighting.scanTarget?.kind ?? 'none'})`);
      } else standIns.push('no Sighting in this build');
    } else {
      let tab = s;
      if (s === 'character') { tab = 'inventory'; standIns.push('no Character page yet: the satchel is shown'); }
      const ok = C.menus?.openHub ? C.menus.openHub(tab) : false;
      if (!ok) standIns.push(`screen ${s} did not open`);
      else undo.push(() => C.menus.closeHub(true));
      await sleep(1300);
    }
  }

  /* ---- 9. freeze and measure ---- */
  E.requestTimeScale('studio', 0);
  undo.push(() => E.requestTimeScale('studio', null));
  if (lateLens) { p._updateCamera = ownLens; await frames(2); }
  await frames(4);
  const ms = [], calls = [], tris = [];
  for (let i = 0; i < (o.measureFrames ?? 24); i++) {
    await raf();
    const lf = E.lastFrame || {};
    ms.push(lf.ms); calls.push(lf.calls); tris.push(lf.triangles);
  }
  const med = (a) => { const b = a.filter(Number.isFinite).sort((x, y) => x - y); return b.length ? b[b.length >> 1] : null; };
  const p95 = (a) => { const b = a.filter(Number.isFinite).sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(b.length * 0.95))] : null; };
  const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
  return {
    at: atName, resolved: { x: r2(bx), z: r2(bz), y: r2(p.position.y), bearing: B },
    hour: r2(env.time), weather: env.weather, state: C.state,
    camera: { mode, pos: [r2(cam.position.x), r2(cam.position.y), r2(cam.position.z)], fov: cam.fov },
    actors: actors.map((r) => ({ type: r.a.type, id: r.a.id || r.a.kind, x: r2(r.x), z: r2(r.z) })),
    measured: { frameMsMedian: r2(med(ms)), frameMsP95: r2(p95(ms)), calls: med(calls), triangles: med(tris), samples: ms.length },
    standIns,
  };
}

export async function unstageFrame() {
  const undo = window.__frameUndo || [];
  window.__frameUndo = [];
  const errors = [];
  while (undo.length) { const fn = undo.pop(); try { fn(); } catch (e) { errors.push(String(e?.message || e)); } }
  await new Promise((r) => requestAnimationFrame(() => r()));
  return { errors };
}
