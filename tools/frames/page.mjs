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
  // (frameset v2) nothing carried in from what ran before on this page (a frame, a row, a clip): no crouch or hang
  // pose, the lance holstered, the bow's holster timer spent (an earlier aim left the bow in her hand), no arrow
  // stuck in the ground
  try { if (p.crouching) p.setCrouch?.(false); } catch (e) { /* */ }
  try { p.animator?.setHangPose?.(false); } catch (e) { /* */ }
  try { if (C.combat?.melee?.lanceInHand || (C.combat?.melee?.stance && C.combat.melee.stance !== 'holstered')) C.combat.melee.holsterLance(true); } catch (e) { /* */ }
  if (C.combat) { C.combat._holsterT = 0; C.combat._drawing = false; }
  try { C.combat?.arrows?.recycleAll?.(); } catch (e) { /* */ }

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
    // regfix 2 (instruments, smallest change in this file): the world's keeper Gauge at its post at Sluice 3 is a
    // landmark, not a roamer: it stays in frame where the static stand-in stood until dd5ecaf retired it (F02's and
    // F24's horizon in the accepted anchors), back at its station, held and frozen below with the rest. A frame that
    // stages its own Gauge (F23-gauge, F26, which stand Brea at Sluice 3) shows only that one.
    const K = C.machines?._gaugeKeeper;
    const keepK = !!K && K.alive && !K._disposed && !(st.actors || []).some((a) => a.kind === 'gauge');
    if (keepK) { try { K._resetKeeper?.(); K.root?.updateMatrixWorld?.(true); } catch (e) { /* */ } }
    for (const m of C.machines?.list || []) if (m.root?.visible && !(keepK && m === K)) { m.root.visible = false; undo.push(() => { m.root.visible = true; }); }
    // a hidden machine is also out of play: an alert one in range drew her bow (combat's threat rule) in a frame
    // that shows no machine; frozen and calm for the frame, restored after
    for (const m of C.machines?.list || []) {
      if (m.root?.visible && !(keepK && m === K)) continue;
      const u0 = m.update, s0 = m.state;
      m.update = function () {};
      if (s0 === 'alert' || s0 === 'attack' || s0 === 'search') m.state = 'patrol';
      undo.push(() => { m.update = u0; m.state = s0; });
    }
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
    // (ruling 5: the studio has no wind; the cloth chains read environment.windAt each step, so it answers still air here)
    const windAt0 = env.windAt;
    if (windAt0) { env.windAt = function (x, z, out) { if (out) { out.x = 0; out.z = 0; if ('y' in out) out.y = 0; } return 0; }; undo.push(() => { env.windAt = windAt0; }); }
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
  // camera.lookAt 'off' (frameset v2): her head follows the lens's view direction in play, so a side lens turned
  // her face away from it (F13 sat past profile); for the frame the look layer runs at weight 0 and damps to rest
  if (f.camera?.lookAt === 'off' && typeof p.animator?._lookLayer === 'function') {
    const an = p.animator, ll = an._lookLayer;
    an._lookLayer = function (w, pl, dt) { return ll.call(this, 0, pl, dt); };
    undo.push(() => { an._lookLayer = ll; });
  } else if (f.camera?.lookAt === 'off') standIns.push('camera.lookAt off: the animator has no look layer to hold');

  /* ---- 6. settle: streaming, idle, actors land ---- */
  // (M1a regfix 4, F21) a person is turned to face its mark BEFORE the settle, not after it. spawn() stands them at
  // yaw 0 and the turn below came after the 2.6 s settle, a few frames before the freeze: their dyn_ chains (a head
  // wrap's tail, hair, a cloak) are solved in world space, so the tail was left where it hung before the turn and the
  // frozen frame caught it mid-whip (F21 at 4175212: the raker's wrap tail stood straight up to his rake head; at
  // 6511d94 and 662fb68 filmed with the same filmer it was a loop; at 6511d94's review it hung down). The mark is
  // known here for every lens but the chase (Brea's own place, or the lens, which `aim` puts up from her mark).
  const facePoint = (r) => {
    if (r.a.face !== 'camera') return { x: bx, z: bz };
    if (mode === 'chase' || mode === 'screen' || lateLens) return null;
    aim(); return { x: lens.pos.x, z: lens.pos.z };
  };
  for (const r of actors) {
    if (!r.q) continue;
    const t = facePoint(r);
    if (!t) continue;
    const want = Math.atan2(t.x - r.x, t.z - r.z);
    r.q.yaw = want; if (r.q.group) { r.q.group.rotation.y = want; r.q.group.updateMatrixWorld?.(true); }
    // the chains start from the turned pose's rest, so the settle hangs them under gravity from there
    try { for (const c of r.q.chains?.chains || []) { c.links.forEach((l, i) => l.quaternion.copy(c.bindQ[i])); c.seeded = false; } } catch (e) { /* */ }
  }
  await sleep(o.settleMs ?? 2600);
  for (const r of actors) {
    if (r.m) {   // an Instrument stands still where it was put, facing Brea
      const want = Math.atan2(bx - r.x, bz - r.z);
      r.m.heading = want; if (r.m.root) { r.m.root.position.set(r.x, ground(r.x, r.z), r.z); r.m.root.rotation.y = want; }
      // (instruments, M1a r2) its feet re-planted under the turned pose before it freezes (src/instruments/lib/kindkit.js seatFeet)
      try { r.m.seatFeet?.(); } catch (e) { standIns.push(`Instrument '${r.a.kind}': seatFeet threw (${e.message})`); }
      // (instruments, M1b fix round 1) `calm: true`: filmed with its lamp calm. On open crust a Peg 6 m from her sees
      // her through the settle and was filmed hostile (F23-peg at 8d18c28); the meadow had hidden her
      if (r.a.calm) { try { r.m.suspicion = 0; if (r.m.sc) r.m.sc.suspicion = 0; r.m._unseenT = 99; if (r.m.state !== 'patrol') r.m.setState?.('patrol'); if (r.m.state !== 'patrol') r.m.state = 'patrol'; } catch (e) { standIns.push(`Instrument '${r.a.kind}': not calmed (${e.message})`); } }
      const u0 = r.m.update; r.m.update = function () {}; undo.push(() => { r.m.update = u0; });
    } else if (r.q) {
      const tx = r.a.face === 'camera' ? lens.pos.x : bx, tz = r.a.face === 'camera' ? lens.pos.z : bz;
      const want = Math.atan2(tx - r.x, tz - r.z);
      let turn = Math.abs(want - (r.q.yaw ?? 0)) % (2 * Math.PI); if (turn > Math.PI) turn = 2 * Math.PI - turn;
      r.q.stopWalk?.(); r.q.yaw = want; if (r.q.group) r.q.group.rotation.y = want;
      // a turn left this late (the chase lens: its mark is known only now) re-seats the chains and lets them hang
      if (turn > 0.05) {
        try { for (const c of r.q.chains?.chains || []) { c.links.forEach((l, i) => l.quaternion.copy(c.bindQ[i])); c.seeded = false; } } catch (e) { /* */ }
        r.lateTurn = true;
      }
      if (!r.q.current) standIns.push(`person ${r.a.id}: no clip playing when filmed (bind pose)`);
    }
  }
  if (actors.some((r) => r.lateTurn)) await sleep(1500);

  /* ---- 7a. SIMULATION TIME (M1a regfix 3; the orchestrator's ruling after regressions run 2) ----
   * F15 (the run) and F19 (the lance heavy's contact) were timed by the wall clock: a 1.6 s sleep with the keys held,
   * a poll on rAF for the contact key. Headless frames come at 15-60 Hz and the loop sub-steps whatever time passed,
   * so each film caught a different point of the stride or the swing, and a different integration of the cloth.
   * Staged here on SIMULATION time instead: the page's own animation loop is stopped and the game's frame
   * (main.js `_frame`: simulate, render, tail) is driven by hand, one 1/60 s frame at a time, on a virtual
   * `performance.now` that advances exactly 1000/60 ms per frame (the loop's clock, melee's held-press charge and
   * its pose stamp all read it). Every input the hero's pose reads from outside her own state is pinned for the
   * section: Math.random is a seeded generator (the idle's breath, fidget and blink rolls); the clock `t` that the
   * animator, the environment (wind field, sky, clouds' uniforms), the vegetation, the terrain and the water read
   * starts at T0 = 4096 s and advances only with the section's own frames, so it stands still in the frozen frame
   * (the grass, the water and the sky no longer move between two shots of it); the environment's gust phase and the
   * clouds' drift start at 0; she is put back on her mark (position, velocity, heading); the breath cycle, the gait
   * phase, the idle clip and the melee idle loop start at 0; every cloth and hair chain is re-seated on its rest pose
   * (as `_warmSprings` ends) before 1.5 s of idle and again after it. The camera's fov is held at the frame's own
   * (combat.js eases it toward the hip FOV on real dt every frame, which made the projection differ frame to frame). Dynamic resolution is held off (scale 1) for the frame. The section
   * ends frozen (the 'studio' time scale 0) on a step chosen by the pose's own clock (the gait phase, the swing's
   * contact key), never by elapsed wall time; then the real clock and the page's loop are put back (the systems that
   * read the pinned clock get the real one again at unstage). `sim.out.digest` hashes her state (bones, chains,
   * place, gait, swing) at the section's start, after the idle and at the freeze, so a repeat that differs says
   * where. `o.wallClock: true` films the old way. */
  function simClock() {
    const G = window.__GAME__;
    if (!G || typeof G._frame !== 'function' || !E.clock || !E.renderer?.setAnimationLoop) return null;
    const an = p.animator;
    const out = { frames: 0, seconds: 0 };
    const T0 = 4096, SPF = 1000 / 60;
    E.renderer.setAnimationLoop(null);
    const pnDesc = Object.getOwnPropertyDescriptor(performance, 'now');
    const realNow = () => Performance.prototype.now.call(performance);
    let vNow = realNow();
    Object.defineProperty(performance, 'now', { configurable: true, writable: true, value: () => vNow });
    const rnd0 = Math.random;
    let seed = 0x2545F491;
    Math.random = function () {   // mulberry32
      seed = (seed + 0x6D2B79F5) >>> 0; let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    E.clock.oldTime = vNow; G._lastNow = vNow;
    let ended = false;
    const end = () => {
      if (ended) return; ended = true;
      Math.random = rnd0;
      if (pnDesc) Object.defineProperty(performance, 'now', pnDesc); else delete performance.now;
      const now = performance.now();
      E.clock.oldTime = now; G._lastNow = now;
      E.renderer.setAnimationLoop(() => G._frame());
    };
    undo.push(end);   // a throw mid-section still gets the loop back
    let simN = 0;
    const tFix = () => T0 + simN / 60;
    // the pinned clock: her pose, the wind she feels, the sky, the grass and the water read it through the section
    // and the frozen frame (each is a phase or a uniform of t in those systems; none keeps a time stamp of it)
    const pin = (sys) => { if (!sys?.update) return; const u0 = sys.update; sys.update = function (dt) { return u0.call(this, dt, tFix()); }; undo.push(() => { sys.update = u0; }); };
    pin(an); pin(env); pin(C.vegetation); pin(C.terrain); if (C.water && C.water !== C.terrain?.water) pin(C.water);
    if (Number.isFinite(env._gustPhase)) { const g0 = env._gustPhase; undo.push(() => { env._gustPhase = g0; }); }
    const drifts = [env.u?.calCloudDrift?.value, env.sky?.material?.uniforms?.uDrift?.value].filter((v) => v?.isVector2);
    for (const v of drifts) { const x0 = v.x, y0 = v.y; undo.push(() => v.set(x0, y0)); }
    const rn = (v) => (Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null);
    const digest = () => {
      let bh = 0, i = 0, ch = 0;
      p.model?.traverse((b) => {
        if (!b.isBone) return;
        i++; const q = b.quaternion, ps = b.position, v = i * (q.x + 2 * q.y + 3 * q.z + 4 * q.w) + 0.37 * i * (ps.x + ps.y + ps.z);
        bh += v; if (b.name.startsWith('dyn_')) ch += v;
      });
      const m = C.combat?.melee;
      return { bones: rn(bh), cloth: rn(ch), pos: [rn(p.position.x), rn(p.position.y), rn(p.position.z)], vel: p.velocity ? [rn(p.velocity.x), rn(p.velocity.z)] : null,
        heading: rn(p.heading), speed: rn(p.moveSpeed ?? 0), gait: an?.loco ? rn(an.loco.phase) : null, melee: m ? [m.stance, m.phase, rn(m._t ?? 0), !!m.heavy, !!m.lance] : null };
    };
    out.digest = { start: digest() };
    /* (--state-probe) a hash of every field of her animator, the player, melee, the combat state and the wind, two
     *  levels deep, so two stagings of one frame that differ name the field that carried over from the frame before */
    const stateHash = () => {
      const SKIP = new Set(['ctx', 'scene', 'model', 'root', 'group', 'renderer', 'engine', 'camera', 'events', 'audio', 'player', 'animator', 'combat', 'melee', 'parent', 'children', 'input', 'world', 'environment', 'terrain']);
      const skipObj = (v) => v.isObject3D || v.isMaterial || v.isTexture || v.isBufferGeometry || v.isSkeleton || v.nodeType || typeof v === 'function' || v instanceof WeakMap || v instanceof WeakSet;
      const sh = (str) => { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 1000003; return h; };
      const hv = (v, d, seen) => {
        if (v == null) return 0.5;
        const t = typeof v;
        if (t === 'number') return Number.isFinite(v) ? v : Number.isNaN(v) ? 7.77e5 : 8.88e5 * Math.sign(v);
        if (t === 'boolean') return v ? 1 : 0;
        if (t === 'string') return sh(v);
        if (t !== 'object' || skipObj(v) || seen.has(v) || d > 5) return 0;
        seen.add(v);
        if (ArrayBuffer.isView(v)) { let h = 0; for (let i = 0; i < v.length; i++) h += ((i % 97) + 1) * (Number.isFinite(v[i]) ? v[i] : 3.3e3); return h; }
        if (v._mixer && v._clip) return (v.time || 0) + 3 * (v._effectiveWeight || 0) + 5 * (v.enabled ? 1 : 0) + 7 * (v._effectiveTimeScale || 0);
        let h = 0, i = 0;
        const it = v instanceof Map ? v.entries() : v instanceof Set ? [...v].entries() : Object.entries(v);
        for (const [k, x] of it) { i++; if (typeof k === 'string' && SKIP.has(k)) continue; h += (i % 89 + 1) * hv(x, d + 1, seen) + 1e-3 * sh(String(k)); }
        return h;
      };
      const rn = (v) => (Number.isFinite(v) ? Number(v.toPrecision(12)) : String(v));
      const map = {};
      const flat = (obj, pre, lvl, seen) => {
        if (!obj) return;
        for (const k of Object.keys(obj)) {
          if (SKIP.has(k)) continue;
          const v = obj[k];
          if (v && typeof v === 'object' && !skipObj(v) && !ArrayBuffer.isView(v) && !(v._mixer && v._clip) && lvl < 2 && !Array.isArray(v) && !v.isVector3 && !v.isQuaternion && !v.isVector2) flat(v, pre + k + '.', lvl + 1, seen);
          else { const h = hv(v, 0, seen); if (h !== 0 || typeof v !== 'object') map[pre + k] = rn(h); }
        }
      };
      flat(an, 'an.', 0, new WeakSet()); flat(p, 'p.', 0, new WeakSet()); flat(C.combat?.melee, 'mel.', 0, new WeakSet());
      flat(C.combat, 'cmb.', 1, new WeakSet()); flat(an?.melee, 'anm.', 0, new WeakSet());
      map['env._gustPhase'] = rn(env._gustPhase); map['env._t'] = rn(env._t); map['env.wind.gust'] = rn(env.wind?.gust);
      return map;
    };
    if (o.stateProbe) out.state = {};
    // a clean slate first, whatever the frame before left: a swing runs out, the lance goes back on her back, no
    // crouch, no aim (up to 4 s of the section; how long it takes is not part of the frame)
    const mel = C.combat?.melee;
    C.input.keys.clear(); C.input.mouse.buttons = 0;
    try { if (p.crouching) p.setCrouch?.(false); } catch (e) { /* */ }
    out.slateFrames = 0;
    const slate = (n, until) => { for (let i = 0; i < n && !until(); i++) { vNow += SPF; G._frame(); out.slateFrames++; } };
    const holstered = () => !mel || (!mel.active && mel.stance === 'holstered' && !p.aiming);
    slate(240, () => { if (mel && !mel.active && mel.stance !== 'holstered' && mel.stance !== 'holster') mel.holsterLance(true); return holstered(); });
    // ...and the lance drawn and put back once, so the first frame of a session carries the same lance state as any
    // later one (its hand, carry and stow fields are unset until the first draw)
    if (mel?.drawLance) {
      mel.drawLance(0.2);
      slate(120, () => mel.stance === 'ready' || mel.lanceInHand === true);
      slate(240, () => { if (!mel.active && mel.stance !== 'holstered' && mel.stance !== 'holster') mel.holsterLance(true); return holstered(); });
    }
    // (regfix 4) the draws: the bow raised once and lowered, so the session's first draw carries the same bow state
    // as any later one (the bow pose's blend, hand and aim fields are unset until the first aim: F16 filmed first in a
    // session differed from its repeats on 5 % of the frame at fb6d5f0), then a fixed 1 s for what the slate and the
    // frame before set moving (the lance's carry blend, the bow's holster) to come to rest, and the ground conform's
    // low-pass from zero (it kept the crouch of the frame before: 1.4 mm of pelvis after the idle)
    const bowPose = st.pose === 'draw' || st.pose === 'crouchAim';
    if (bowPose) {
      if (C.quickslots?.select) C.quickslots.select(1);
      C.input.mouse.buttons = 4; slate(30, () => false);
      C.input.mouse.buttons = 0; if (C.combat) C.combat._holsterT = 0;
      slate(120, () => !p.aiming && !C.combat?.weaponDrawn);
      slate(60, () => false);
      if (an && '_grnd' in an) { an._grnd = 0; an._grndWant = null; an._grndRate = 0; }
    }
    /* (M1b, engine: the F15 debt) HER PERSISTENT STATE BACK TO THE CONSTRUCTOR'S, THEN 3 s ON HER MARK. The state
     *  probe (film.mjs --state-probe, run 20261115T181752Z-2d1a8f6-engine-slate-full-x3) found what the slate let
     *  through from the frames before: the gait's backpedal mirror (`loco.reverse` holds its value while she stands:
     *  -0.80 after the full set's crouched strafe, so the next run set off mirrored and froze at another phase, 34 % of
     *  the frame), the run bob's mean height (`_bobMean`, a 2.5 1/s low-pass: 2 % of the frame before's left after the
     *  idle), the ground conform (bow poses only until now), the planted foot locks (world anchors from the frame
     *  before's mark: `replant`, as a respawn), the lateral widen latch, the trunk's step, her local velocity and jerk
     *  low-passes, the player's bob phase and melee's pelvis-shift history. Each is put back to its constructor value,
     *  and then she stands on her mark for a fixed 3 s (no input, the clock pinned) so every other low-pass the frame
     *  before moved (hundreds of fields, most of them read-outs) has decayed before the section's clocks start */
    const rest0 = () => {
      const L = an?.loco;
      if (L) {
        L.reverse = 1; L._revSign = 1; L.warp = 1; L.freq = 0; L.legYaw = 0; L.hipYaw = 0; L.lateral = 0; L.widen = 0;
        if (!p.crouching) L.crouchW = 0;
        L.dodgeW = 0;
        if (L.w) for (const k in L.w) L.w[k] = k === 'idle' ? 1 : 0;
      }
      if (an) {
        try { an.replant?.(); } catch (e) { /* */ }
        if ('_grnd' in an) { an._grnd = 0; an._grndWant = null; an._grndRate = 0; }
        an._bobMean = NaN; if ('trunkStep' in an) an.trunkStep = 0;
        /* the run bob's keep is read at a run's first steps before that run sets it (locomotionDriver `keepEff`): after
         *  F19's lunge it held the jog's 0.25 into F15's sprint (constructor: the sprint's keep), and F15 filmed after
         *  F19 lifted its back panel (full set at 21ca75c, the third staging; the first two, 0.42, hung it) */
        an._bobKeep = an.T?.runBob ? an.T.runBob.keep : 0.5; if ('_trunkPitch0' in an) an._trunkPitch0 = 0;
        if (Array.isArray(an._widenHold)) an._widenHold.fill(0);
        for (const k of ['_lvx', '_lvz', '_prevLvx', '_prevLvz', '_jerkX', '_jerkZ', '_yawRate', '_mx', '_latMove', '_moveW', '_runW']) if (k in an) an[k] = 0;
        if (an.melee && '_pelvisShiftOk' in an.melee) an.melee._pelvisShiftOk = false;
        /* (the run and the heavy only: the bow poses keep the slate's one raise above) her bow as if never drawn: the
         *  bow's stow path (`_bp`, built on first use, its blend and grab fixed by the first aim), the elbow form's
         *  costs (`_efS`) and the wrist reference the aim set. Short session at 2857771: F15 filmed before any draw hung
         *  its back panel along the thigh, as the anchor (filmed in a session with no draw); filmed after F16's draw it
         *  lifted to the review's 40 deg with the hem turned out flat */
        if (!bowPose) {
          an._bp = null; an._wrRefOk = false; an._gripE = 0; an._gripH = 0; if ('_qbF' in an) an._qbF = 1;
          if (an._efS) Object.assign(an._efS, { r: 0, shU: 0, shY: 0, hR: 0, hdF: 0, hD: 0, lo: 0, hi: 0, bh: 0, bd: 0, drop: 0, r52: 1, out: 0, shL: 0 });
        }
      }
      if ('_bobPhase' in p) { p._bobPhase = 0; p._bobK = 0; }
    };
    const onMark = () => {
      p.position.set(bx, 0, bz); p.velocity?.set?.(0, 0, 0); p._snapToGround?.();
      p.heading = H; p.camYaw = -B * D2R; if ('moveSpeed' in p) p.moveSpeed = 0;
      if ('_faceX' in p) { p._faceX = p._candX = Math.sin(H); p._faceZ = p._candZ = Math.cos(H); p._latchT = 0; }
    };
    C.input.keys.clear(); C.input.mouse.buttons = 0;
    onMark(); rest0();
    slate(180, () => false);
    // the section's own clocks start here, after the slate: the random sequence, the gusts, the clouds' drift
    seed = 0x2545F491;
    if (Number.isFinite(env._gustPhase)) env._gustPhase = 0;
    for (const v of drifts) v.set(0, 0);
    if (E.setDynamicResolution) {
      const d0 = !!E.drsEnabled; E.setDynamicResolution(false);
      undo.push(() => { if (d0) E.setDynamicResolution(true); });
    }
    // the hero's own clocks, from a fixed start
    if (an) {
      // the idle's life from the animator's constructor values (breath, weight shift, fidget, blink, settle, exertion,
      // the pelvis' low-pass); the rolls after this come from the seeded generator
      const set = (k, v) => { if (k in an) an[k] = v; };
      set('_breathPh', 0); set('_brNow', 0.4); set('_brLag', 0.4); set('_puff', 0);
      set('_shiftPh', 0); set('_shift', 0); set('_fidgetT', 6); set('_fidgetK', 1); set('_fidgetKind', 0); set('_idleT', 0);
      set('_blinkT', 3); set('_blinkK', 1); set('_lidBlink', 0);
      set('_settleT', 1); set('_settleAmp', 0); set('_prevSpd', 0); set('_recentSpd', 0); set('_strideT', 0);
      set('_stableX', 0); set('_stableZ', 1); set('_leanAcc', 0); set('_bank', 0);
      if ('_pelvisRestY' in an) { set('_pelvBase', an._pelvisRestY); set('_pelvBob', 0); set('_headStab', 0); }
      if (an.loco) { an.loco.phase = 0; for (const k of ['idle', 'crouchIdle']) if (an.loco.actions?.[k]) an.loco.actions[k].time = 0; }
      if (an.melee && '_idleT' in an.melee) an.melee._idleT = 0;
      out.chains = (an._chains || []).length;
    }
    // every cloth and hair chain re-seated on the animated pose of the next step, at rest (as `_warmSprings` ends)
    /* (M1b, engine: F15's back panel lifted in a full-set session and hung in a short one at one commit, 705c2f2.
     *  The re-seat now clears ALL of a chain's history, not only its particles: `flX`, the flutter's own phase, which a
     *  run (the wrap's `runFl`) advanced and nothing put back, so every later stride met another phase of the wave;
     *  `swK`, the lance swing's ease (F19 left it part-way); the moving ease and her own covered speed; the foot-strike
     *  edges (a step 'landed' on the first frame after the slate when the frame before ended mid-stride). The people's
     *  chains too (PersonChains: links back on bind, the sub-step remainder and their own wind clock at 0). The air
     *  needs nothing more: the gust phase starts at 0 with the section's clocks (above), the field she reads is a
     *  function of the pinned clock, and her gust and flutter gains are constants set once at construction) */
    const reseat = () => {
      if (an) {
        for (const c of an._chains || []) {
          c.seeded = false; c.mvK = NaN; c.mvV = NaN; c.swK = NaN; c.flX = 0;
          if (c.vel) c.vel.fill(0); if (c.animVel) c.animVel.fill(0); if (c.acc) c.acc.fill(0);
        }
        if ('_mvSelf' in an) an._mvSelf = NaN;
        if ('_prevStL' in an) { an._prevStL = an._stL; an._prevStR = an._stR; }
      }
      for (const q of C.people?.list || []) {
        const pc = q.chains;
        if (!pc?.chains) continue;
        pc.acc = 0; pc.t = 0;
        for (const c of pc.chains) { try { c.links.forEach((l, i) => l.quaternion.copy(c.bindQ[i])); } catch (e) { /* */ } c.seeded = false; }
      }
    };
    reseat();
    // THE LENS'S FIELD OF VIEW, HELD. combat.js eases camera.fov toward the hip FOV every frame on REAL dt, after the
    // player's camera (the frame's own lens) has set the frame's fov, so the filmed fov was 45 plus a share of the
    // difference that depends on how long that frame took: the projection changed frame to frame (measured at
    // aeeb742: two shots of one frozen F15 differed on 4-34 % of pixels, all at edges). For these frames the
    // camera's fov is the frame's own, fixed until unstage
    if (f.camera?.fov) {
      const d0 = Object.getOwnPropertyDescriptor(cam, 'fov'), F = f.camera.fov;
      Object.defineProperty(cam, 'fov', { configurable: true, enumerable: true, get: () => F, set: () => {} });
      cam.updateProjectionMatrix();
      undo.push(() => { if (d0) Object.defineProperty(cam, 'fov', d0); else delete cam.fov; cam.updateProjectionMatrix(); });
      out.fov = F;
    }
    // back on her mark (the settle above stood her there; the foot locks re-planted where she stands)
    try { an?.replant?.(); } catch (e) { /* */ }
    p.position.set(bx, 0, bz); p.velocity?.set?.(0, 0, 0); p._snapToGround?.();
    p.heading = H; p.camYaw = -B * D2R; if ('moveSpeed' in p) p.moveSpeed = 0;
    // ...and facing her mark: the travel-facing latch (player.js _latchFacing) keeps the last facing it took, so a
    // session's first run turned from the constructor's (0, 1) and set off 2 steps later than any later one (60704c3)
    if ('_faceX' in p) { p._faceX = p._candX = Math.sin(H); p._faceZ = p._candZ = Math.cos(H); p._latchT = 0; }
    const sim = {
      out,
      step(n) {
        for (let i = 0; i < n; i++) { vNow += SPF; simN++; G._frame(); out.frames++; }
        out.seconds = Math.round(out.frames / 60 * 1000) / 1000;
      },
      // 1.5 s of idle for her body's low-passes to settle, then the chains re-seated once more on that settled pose:
      // the cloth is the part of her that keeps a difference longest, so it starts its motion from rest
      idle() { if (o.stateProbe) out.state.seated = stateHash(); sim.step(90); reseat(); sim.step(1); out.digest.idle = digest(); if (o.stateProbe) out.state.idle = stateHash(); },
      freeze() { E.requestTimeScale('studio', 0); out.renderScale = E.renderScale ?? null; out.digest.end = digest(); end(); },
    };
    return sim;
  }

  /* ---- 7. pose ---- */
  const press = (code) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code })); window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code })); };
  const pose = st.pose || 'idle';
  undo.push(() => { C.input.keys.clear(); C.input.mouse.buttons = 0; if (p.crouching) p.setCrouch?.(false); });
  // (regfix 4: F16, F17 and F18 too, the orchestrator's ruling after regressions run 3: F18's 1.3 s wall-clock strafe
  // caught a different point of the crouched stride in every film)
  const SIM_POSES = ['run', 'lanceHeavy', 'draw', 'crouchAim'];
  const sim = SIM_POSES.includes(pose) && o.wallClock !== true ? simClock() : null;
  if (SIM_POSES.includes(pose) && !sim && o.wallClock !== true) standIns.push(`pose ${pose}: the game loop cannot be driven from the page (no __GAME__._frame or engine.clock): staged on the wall clock, it will not repeat`);
  if (pose === 'run') {
    if (sim) {
      // the run on simulation time: 1.5 s of idle from a re-seated rest, then W + Shift for at least 1.4 s of
      // simulation, frozen on the first step at or past the master gait phase `clipPhase` (default 0: the left
      // ball furthest forward, the side nearest the side lens; clipLibrary.js phaseOffset)
      const loco = p.animator?.loco;
      sim.idle();
      C.input.keys.add('KeyW'); C.input.keys.add('ShiftLeft');
      sim.step(84);
      const want = Number.isFinite(o.clipPhase) ? o.clipPhase : Number.isFinite(st.clipPhase) ? st.clipPhase : 0;
      let hit = !loco;
      for (let i = 0; i < 90 && !hit; i++) {
        const u0 = loco.phase; sim.step(1); const u1 = loco.phase;
        const span = ((u1 - u0) % 1 + 1) % 1, past = ((u1 - want) % 1 + 1) % 1;
        if (span > 0 && span < 0.5 && past <= span) hit = true;
      }
      sim.freeze();
      sim.out.clipPhase = loco ? Math.round(loco.phase * 1e4) / 1e4 : null; sim.out.clipPhaseWanted = want;
      if (!loco) standIns.push('pose run: no locomotion blend on the animator; frozen 1.4 s into the run, phase unknown');
      else if (!hit) standIns.push(`pose run: the gait phase did not reach ${want} within 1.5 s more; frozen at ${sim.out.clipPhase}`);
    } else { C.input.keys.add('KeyW'); C.input.keys.add('ShiftLeft'); await sleep(1600); }
  } else if ((pose === 'draw' || pose === 'crouchAim') && sim) {
    // (regfix 4) the draw and the crouched aim-strafe on simulation time: the wall clock's own beats as whole 1/60 s
    // steps (bow 0.35 s, crouch 0.3 s, aim 0.45 s, draw held 1.3 s, strafing right in the crouch), from 1.5 s of idle
    // on a re-seated rest. The strafe then freezes on the first step at or past the master gait phase `clipPhase`
    // (frameset state, or the filmer's `o.clipPhase`; default 0.75), within at most 1.5 s more. 0.75 by a probe at
    // fb6d5f0 (run 20261115T170951Z-fb6d5f0-eng4-f18phase-partial-x4: phases 0, 0.25, 0.5, 0.75): at 0.75 the near
    // knee is down toward the lens and the front panel hangs to the ground, as in the accepted wall-clock anchor; at
    // 0.5 the near leg is thrown out wide, at 0 the boots stand together (the run-3 review's 'side by side')
    sim.idle();
    if (C.quickslots?.select) C.quickslots.select(1); else press('Digit1');
    sim.step(21);
    if (pose === 'crouchAim') { p.setCrouch?.(true); sim.step(18); }
    C.input.mouse.buttons |= 4; sim.step(27);
    C.input.mouse.buttons |= 1;
    if (pose === 'crouchAim') C.input.keys.add('KeyD');
    sim.step(78);
    if (pose === 'crouchAim') {
      const loco = p.animator?.loco;
      const want = Number.isFinite(o.clipPhase) ? o.clipPhase : Number.isFinite(st.clipPhase) ? st.clipPhase : 0.75;
      let hit = !loco;
      for (let i = 0; i < 90 && !hit; i++) {
        const u0 = loco.phase; sim.step(1); const u1 = loco.phase;
        const span = ((u1 - u0) % 1 + 1) % 1, past = ((u1 - want) % 1 + 1) % 1;
        if (span > 0 && span < 0.5 && past <= span) hit = true;
      }
      sim.out.clipPhase = loco ? Math.round(loco.phase * 1e4) / 1e4 : null; sim.out.clipPhaseWanted = want;
      if (!loco) standIns.push('pose crouchAim: no locomotion blend on the animator; frozen 1.3 s into the strafe, phase unknown');
      else if (!hit) standIns.push(`pose crouchAim: the gait phase did not reach ${want} within 1.5 s more; frozen at ${sim.out.clipPhase}`);
    }
    sim.out.aiming = !!p.aiming;
    sim.freeze();
    if (!p.aiming) standIns.push(`pose ${pose}: the aim did not engage`);
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
    // (regfix 3) on simulation time when the game loop can be driven: 1.5 s of idle from a re-seated rest, the lance
    // drawn for 0.9 s, the held press, frozen on the first step at or past the contact key (0.62 of the strike)
    if (sim) sim.idle();
    if (C.quickslots?.select) C.quickslots.select(2); else press('Digit2');
    if (sim) sim.step(54); else await sleep(900);
    // (M1.3d, hero-anim) the swing's bearing pinned to her facing, not to the film lens; the held press grows
    // into the heavy, and the frame freezes on its contact hold (the strike phase from the contact key on)
    const mel = C.combat?.melee;
    const lock0 = mel ? mel.aimLock : null;
    if (mel) { mel.aimLock = 0; undo.push(() => { mel.aimLock = lock0; }); }
    C.input.mouse.buttons |= 1;
    let atContact = false;
    const atK = () => !!(mel?.heavy && mel.phase === 'strike' && mel._phaseEnd > 0 && mel._t / mel._phaseEnd >= 0.62);
    if (sim) {
      for (let i = 0; i < 150 && !atContact; i++) { sim.step(1); atContact = atK(); }
      C.input.mouse.buttons &= ~1;
      sim.freeze();
      sim.out.contactK = mel && mel._phaseEnd > 0 ? Math.round(mel._t / mel._phaseEnd * 1e4) / 1e4 : null;
    } else {
      const tH = performance.now();
      while (performance.now() - tH < 2500) {
        await frames(1);
        if (atK()) { atContact = true; break; }
      }
      C.input.mouse.buttons &= ~1;
    }
    if (!atContact) standIns.push('pose lanceHeavy: the heavy\'s contact hold was not reached within 2.5 s; filmed where the swing was');
  } else if (pose === 'sit') {
    // (systems M1.6c, smallest change) the Brazier seats her on its seat block, facing the fire (player.ride 'sitIdle')
    if (C.braziers?.seatHere?.()) { undo.push(() => C.braziers.stand?.()); await sleep(1200); }
    else standIns.push('pose sit: no seated pose yet, filmed idle');
  }

  // the section ran ahead of the streaming (she covered 9 m in it): with the world frozen, the page's own loop catches
  // the terrain, the plants and the shadows up before the shot
  if (sim) await sleep(o.simSettleMs ?? 2000);

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
  // her screen box (viewport CSS px: what she, her kit and her weapons cover, skinned), for diffs read on her alone
  const heroBox = () => {
    try {
      if (!p.model || !p.model.visible) return null;
      const B = new V3(), lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
      const box = { min: new V3(Infinity, Infinity, Infinity), max: new V3(-Infinity, -Infinity, -Infinity) };
      p.model.updateMatrixWorld(true);
      p.model.traverseVisible((m) => {
        if (!m.isMesh || !m.geometry?.attributes?.position) return;
        const pos = m.geometry.attributes.position, n = pos.count, stride = Math.max(1, Math.floor(n / 4000));
        for (let i = 0; i < n; i += stride) {
          if (m.getVertexPosition) m.getVertexPosition(i, B); else B.fromBufferAttribute(pos, i);
          B.applyMatrix4(m.matrixWorld);
          box.min.min(B); box.max.max(B);
        }
      });
      if (!Number.isFinite(box.min.x)) return null;
      const W = innerWidth, Hh = innerHeight;
      for (let k = 0; k < 8; k++) {
        B.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).project(cam);
        const x = (B.x + 1) / 2 * W, y = (1 - B.y) / 2 * Hh;
        lo[0] = Math.min(lo[0], x); lo[1] = Math.min(lo[1], y); hi[0] = Math.max(hi[0], x); hi[1] = Math.max(hi[1], y);
      }
      const cl = (v, m) => Math.round(Math.max(0, Math.min(m, v)));
      return [cl(lo[0], W), cl(lo[1], Hh), cl(hi[0], W), cl(hi[1], Hh)];
    } catch (e) { return null; }
  };
  const med = (a) => { const b = a.filter(Number.isFinite).sort((x, y) => x - y); return b.length ? b[b.length >> 1] : null; };
  const p95 = (a) => { const b = a.filter(Number.isFinite).sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(b.length * 0.95))] : null; };
  const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
  return {
    at: atName, resolved: { x: r2(bx), z: r2(bz), y: r2(p.position.y), bearing: B },
    hour: r2(env.time), weather: env.weather, state: C.state,
    camera: { mode, pos: [r2(cam.position.x), r2(cam.position.y), r2(cam.position.z)], fov: cam.fov },
    actors: actors.map((r) => ({ type: r.a.type, id: r.a.id || r.a.kind, x: r2(r.x), z: r2(r.z) })),
    measured: { frameMsMedian: r2(med(ms)), frameMsP95: r2(p95(ms)), calls: med(calls), triangles: med(tris), samples: ms.length, renderScale: E.renderScale ?? null },
    sim: sim ? sim.out : null,
    heroBox: heroBox(),
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
