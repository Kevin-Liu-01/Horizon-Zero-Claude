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
  // page chrome: hidden unless the frame shows the HUD or a screen
  const showChrome = !!st.hud || f.camera?.mode === 'screen';
  for (const el of Array.from(document.body.children)) {
    if (el.tagName === 'CANVAS' || el.querySelector?.('canvas') || el.tagName === 'SCRIPT') continue;
    const v = el.style.visibility;
    if (!showChrome) { el.style.visibility = 'hidden'; undo.push(() => { el.style.visibility = v; }); }
  }
  if (st.hud) { const hud = document.getElementById('hud'); if (hud?.classList.contains('hidden')) { hud.classList.remove('hidden'); undo.push(() => hud.classList.add('hidden')); } }
  if (st.hideKit && p.hero?.kit?.setHidden) { const h0 = p.hero.kit.hidden; p.hero.kit.setHidden(3); undo.push(() => p.hero.kit.setHidden(h0)); }

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
  if (mode === 'chase' || mode === 'screen') {
    p._updateCamera = function (dt, t) { p.camYaw = -B * D2R; p.camPitch = pitchR; if (st.pose !== 'run') p.heading = H; return upd0.call(this, dt, t); };
  } else {
    p._updateCamera = function () { if (st.pose !== 'run') p.heading = H; aim(); };
  }
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
      if (C.sighting?.toggle) { C.sighting.toggle(true); undo.push(() => C.sighting.toggle(false)); await sleep(1800); }
      else standIns.push('no Sighting in this build');
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
