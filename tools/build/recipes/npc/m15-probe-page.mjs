/**
 * BUILD M1.5f and M1.5d (first part) — the people's live measurements, the page half (lane people). Run by
 *   node tools/frames/film.mjs --port <p> --only F20,F22 --probe /tools/build/recipes/npc/m15-probe-page.mjs
 * after each frame is staged and screenshotted; it measures on F20 and F22 and skips every other frame.
 *
 * F20 — the 30 s dialogue capture (M1.5f). Ansel (F20's own guild-matron) and Brea are stood at the third pan (the quest's
 * Ansel anchor, Brea 1.5 m from her toward the pans' middle, each turned to the other), the world runs (time scale 1), the
 * lens is over Brea's shoulder on Ansel, and the scene "pan" of Raker's Morning plays through the presenter (each card held
 * for its text's reading time + 1.1 s, the scene restarted until 30 s are up). Every animation frame, off the DEFORMED
 * skins (three's getVertexPosition: the morph targets and the skinning the GPU applies), per face:
 *   blinks     each eye's upper-lid probe vertex (the one the full blink moves furthest), its angle about the eye's centre in
 *              the face's frame against its open and shut angles; a blink is a crossing of 0.7 shut (both eyes' mean)
 *   gaze       each eye's centre-to-pole direction (the ball's front pole), the two averaged, against the direction from the
 *              eyes' midpoint to the other speaker's eyes' midpoint (deg): while this face speaks and while it listens
 *   frozen     the longest run (s) in which no face vertex sampled (both poles, both lid probes, both lips) moved 0.02 mm in
 *              the face's own frame
 *   mouth      the lips' gap over rest (mm) while this face speaks and while it does not
 * plus four stills (JPEG data URLs): the over-the-shoulder lens, Ansel close mid-word, Ansel mid-blink, Brea close mid-word.
 *
 * F22 — the routine log (M1.5d). The routines are forced on in the film, the crew adopted and the lamp keeper spawned, then
 * two in-game hours from 18:00 are stepped through the people system at 1/30 s (the environment's own golden clock rate
 * for the hours; the render is not needed for a log), every routine person held at tier 1 so their pose is evaluated.
 * Every 0.25 s per person: activity, clip, position, both upper arms' elevation, whether a static blocking collider holds
 * the spot, whether the ground there is under the sea. Reported per person: activity changes, the longest stationary run outside a work or seated clip (s), samples
 * with no clip or both arms within 15 deg of level (the bind pose), samples inside a collider.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const D2R = Math.PI / 180;

export async function probe(frame) {
  if (frame?.id === 'F20') return faceCapture();
  if (frame?.id === 'F22') return routineLog();
  return { skipped: 'measured on F20 and F22 only' };
}

/* ======================================================================= F20: the dialogue */

async function faceCapture() {
  const THREE = await import('/tools/look/three.mjs');
  const { speechTrack } = await import('/src/world/npc/people/face.js');
  const { TEXT } = await import('/src/game/text.js');
  const C = window.__CTX__, E = C.engine, R = E.renderer, cam = C.camera, p = C.player, PS = C.people, SG = C.systemsGame;
  const F = PS?.faces;
  if (!F) return { error: 'no faces director' };
  const out = {};
  const undo = [];
  try {
    F.installBrea();
    if (!F.brea) return { error: `no face on Brea: ${F.breaError}` };
    // F20's own Ansel: the film hides every person it found and then stands its actors, so the shown one
    let ansel = (PS.list || []).filter((q) => q.archetype === 'guild-matron' && q.group.visible).pop();
    if (!ansel) { ansel = await PS.spawn('guild-matron', { x: p.position.x + 2, z: p.position.z, yaw: 0, seed: 64 }); undo.push(() => PS.despawn(ansel)); }
    if (!ansel.face) return { error: 'Ansel has no face' };
    const a0 = F.alive; F.alive = true; undo.push(() => { F.alive = a0; });
    const pe0 = SG.people.ansel; SG.people.ansel = ansel; undo.push(() => { SG.people.ansel = pe0; });
    // the third pan
    const ground = (x, z) => C.terrain?.getHeight?.(x, z) ?? p.position.y;
    const A = SG.A.ansel, pans = SG.A.pans;
    const d = new THREE.Vector3(pans.x - A.x, 0, pans.z - A.z).normalize();
    const B = { x: A.x + d.x * 1.5, z: A.z + d.z * 1.5 };
    const pos0 = { a: ansel.group.position.clone(), ay: ansel.yaw, p: p.position.clone(), h: p.heading };
    undo.push(() => { ansel.setPosition(pos0.a.x, pos0.a.z); ansel.yaw = pos0.ay; ansel.group.rotation.y = pos0.ay; p.position.copy(pos0.p); p.heading = pos0.h; });
    ansel.stopWalk?.(); ansel.setPosition(A.x, A.z);
    const ya = Math.atan2(B.x - A.x, B.z - A.z), yb = Math.atan2(A.x - B.x, A.z - B.z);
    ansel.yaw = ya; ansel.group.rotation.y = ya;
    try { for (const c of ansel.chains?.chains || []) { c.links.forEach((l, k) => l.quaternion.copy(c.bindQ[k])); c.seeded = false; } } catch (e) { /* */ }
    try { ansel.play('Idle_Talking_Loop', { fade: 0, offset: 0.1 }); } catch (e) { /* */ }
    PS.tierAt(ansel, 0); undo.push(() => PS.tierAt(ansel, null));
    const vis0 = ansel.group.visible; ansel.group.visible = true; undo.push(() => { ansel.group.visible = vis0; });
    p.position.set(B.x, ground(B.x, B.z), B.z); p.heading = yb;
    out.place = { ansel: [A.x, A.z].map((v) => +v.toFixed(2)), brea: [B.x, B.z].map((v) => +v.toFixed(2)), apartM: 1.5 };
    // the lens: over her right shoulder on Ansel's face; it holds her heading
    const right = new THREE.Vector3(-Math.cos(yb), 0, Math.sin(yb));
    const fwd = new THREE.Vector3(Math.sin(yb), 0, Math.cos(yb));
    const ots = () => {
      const g = ground(B.x, B.z);
      cam.position.set(B.x - fwd.x * 0.9 + right.x * 0.62, g + 1.62, B.z - fwd.z * 0.9 + right.z * 0.62);
      cam.lookAt(A.x, ground(A.x, A.z) + 1.48, A.z); if (cam.fov !== 34) { cam.fov = 34; cam.updateProjectionMatrix(); } cam.updateMatrixWorld();
    };
    const upd0 = p._updateCamera; undo.push(() => { p._updateCamera = upd0; });
    p._updateCamera = function () { p.heading = yb; ots(); };
    const fov0 = cam.fov; undo.push(() => { cam.fov = fov0; cam.updateProjectionMatrix(); });
    // the world runs
    const ts0 = E.timeScaleSources?.().studio; E.requestTimeScale('studio', null); undo.push(() => E.requestTimeScale('studio', ts0 ?? null));
    const tf0 = C.environment?.timeFrozen;
    await sleep(2500);

    // ---- the faces' probe vertices
    const faces = [{ who: 'ansel', f: ansel.face }, { who: 'brea', f: F.brea }];
    const v = new THREE.Vector3(), w = new THREE.Vector3(), cw = new THREE.Vector3(), ax = new THREE.Vector3(), ay = new THREE.Vector3(), az = new THREE.Vector3();
    for (const o of faces) {
      const f = o.f, g = f.mesh.geometry, rig = f.rig, s = rig.s, pos = g.getAttribute('position'), full = g.morphAttributes.position[1];
      o.lid = rig.eyes.map((Ey) => {
        let best = -1, bm = 0;
        for (let i = 0; i < pos.count; i++) {
          const dy = full.getY(i), dz = full.getZ(i), dx = full.getX(i);
          if (dy >= 0) continue;
          const px = pos.getX(i) * s - Ey.c[0], py = pos.getY(i) * s - Ey.c[1];
          if (Math.abs(px) > 0.004 || py < 0) continue;
          const m = Math.hypot(dx, dy, dz);
          if (m > bm) { bm = m; best = i; }
        }
        const ang = (k) => { const y = (pos.getY(best) + full.getY(best) * k) * s - Ey.c[1], z = (pos.getZ(best) + full.getZ(best) * k) * s - Ey.c[2]; return Math.atan2(y, z); };
        return { i: best, open: ang(0), shut: ang(1) };
      });
      o.pole = rig.eyes.map((Ey) => Ey.pole);
      o.lips = [rig.mouth.lowerLip, rig.mouth.upperLip];
      o.rest = { gap: null };
    }
    const world = (f, i, out3) => { f.mesh.getVertexPosition(i, out3); return out3.applyMatrix4(f.mesh.matrixWorld); };
    const eyeC = (f, k, out3) => out3.fromArray(f.rig.eyes[k].cHead).applyMatrix4(f.head.matrixWorld);
    // rest lip gaps from the bind data (no influence)
    for (const o of faces) {
      const pos = o.f.mesh.geometry.getAttribute('position'), s = o.f.rig.s, [lo, up] = o.lips;
      o.rest.gap = Math.hypot((pos.getX(lo) - pos.getX(up)) * s, (pos.getY(lo) - pos.getY(up)) * s, (pos.getZ(lo) - pos.getZ(up)) * s);
    }
    const rec = faces.map(() => ({ n: 0, closed: [], gazeSpeak: [], gazeListen: [], gapSpeak: [], gapQuiet: [], still: 0, maxStill: 0, sig: null, blinkGeo: 0, wasShut: false, cone: [] }));

    // ---- the scene, played through the presenter
    const scene = TEXT.quest.scenes.find((x) => x.id === 'pan');
    const P = SG.present;
    let playing = null, cardAt = 0, lastCard = null, cardsShown = 0;
    const startScene = () => { playing = P.scene(scene, SG.S.speakers, { next: '' }).then(() => { playing = null; }); };
    startScene();
    const stills = {};
    const grab = () => R.domElement.toDataURL('image/jpeg', 0.88);
    const closeUp = (f, side = 1) => {
      // 0.7 m in front of the face, a little toward the other speaker
      f.eyesWorld(cw); f.axesWorld(ax, ay, az);
      const c0 = cam.position.clone(), q0 = cam.quaternion.clone();
      cam.position.copy(cw).addScaledVector(az, 0.62).addScaledVector(ax, 0.16 * side).addScaledVector(ay, 0.02);
      cam.lookAt(cw.x, cw.y - 0.035, cw.z); cam.updateMatrixWorld();
      E.render(0); const img = grab();
      cam.position.copy(c0); cam.quaternion.copy(q0); cam.updateMatrixWorld();
      return img;
    };
    const T0 = performance.now();
    let lastT = T0, frames = 0;
    let blinkForced = false;
    while (performance.now() - T0 < 30000) {
      await new Promise((r) => requestAnimationFrame(() => r()));
      const now = performance.now(), t = (now - T0) / 1000;
      frames++;
      // cards: advanced after their reading time + 1.1 s
      const card = P.card || null;
      if (card !== lastCard) { lastCard = card; cardAt = t; if (card) cardsShown++; }
      if (card && t - cardAt > speechTrack(card.text).duration + 1.1) P._advance?.();
      if (!playing && !P.busy) startScene();
      // sample
      faces.forEach((o, k) => {
        const f = o.f, r = rec[k];
        r.n++;
        f.axesWorld(ax, ay, az);
        // lids
        let cl = 0;
        o.lid.forEach((L, e) => {
          world(f, L.i, w); eyeC(f, e, cw); w.sub(cw);
          const th = Math.atan2(w.dot(ay), w.dot(az));
          cl += (L.open - th) / (L.open - L.shut);
        });
        cl /= 2;
        r.closed.push(+cl.toFixed(3));
        if (cl > 0.7 && !r.wasShut) { r.blinkGeo++; r.wasShut = true; } else if (cl < 0.3) r.wasShut = false;
        // gaze: the mean of both balls' centre-to-pole against the eyes' midpoint to the other's eyes
        const other = faces[1 - k].f;
        v.set(0, 0, 0);
        for (let e = 0; e < 2; e++) { world(f, o.pole[e], w); eyeC(f, e, cw); v.add(w.sub(cw).normalize()); }
        v.normalize();
        f.eyesWorld(cw); other.eyesWorld(w); w.sub(cw).normalize();
        const ang = Math.acos(Math.max(-1, Math.min(1, v.dot(w)))) / D2R;
        const speaking = card && card.who === o.who;
        if (card && speaking) r.gazeSpeak.push(ang); else if (card) r.gazeListen.push(ang);
        r.cone.push(+(f.cone / D2R).toFixed(2));
        // lips
        world(f, o.lips[0], v); world(f, o.lips[1], w);
        const gap = (v.distanceTo(w) - o.rest.gap * (f.head.matrixWorld.getMaxScaleOnAxis())) * 1000;
        (speaking ? r.gapSpeak : r.gapQuiet).push(gap);
        // the face's own frame: is anything moving?
        f.eyesWorld(cw);
        const sig = [];
        for (const i of [o.pole[0], o.pole[1], o.lid[0].i, o.lid[1].i, o.lips[0], o.lips[1]]) { world(f, i, w); w.sub(cw); sig.push(w.dot(ax), w.dot(ay), w.dot(az)); }
        if (r.sig) {
          let m = 0; for (let j = 0; j < sig.length; j++) m = Math.max(m, Math.abs(sig[j] - r.sig[j]));
          if (m < 0.00002) { r.still += (now - lastT) / 1000; r.maxStill = Math.max(r.maxStill, r.still); } else r.still = 0;
        }
        r.sig = sig;
      });
      lastT = now;
      // stills
      if (!stills.ots && card?.who === 'ansel' && t - cardAt > 1.2) stills.ots = grab();
      if (!stills.anselWord && card?.who === 'ansel' && ansel.face.mouth[0] > 0.45) stills.anselWord = closeUp(ansel.face, 1);
      if (!stills.breaWord && card?.who === 'brea' && F.brea.mouth[0] > 0.45) stills.breaWord = closeUp(F.brea, -1);
      if (!blinkForced && t > 20 && !card?.who?.includes?.('ansel')) { ansel.face.blinkIn = 0; blinkForced = now; }
      if (blinkForced && !stills.anselBlink && now - blinkForced > 85) stills.anselBlink = closeUp(ansel.face, 1);
    }
    // close the scene
    for (let k = 0; k < 20 && P.busy; k++) { P._advance?.(); P._pick?.(0); await sleep(30); }
    const stat = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return { n: a.length, mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2), max: +s[s.length - 1].toFixed(2) }; };
    out.seconds = +((performance.now() - T0) / 1000).toFixed(2);
    out.frames = frames;
    out.cardsShown = cardsShown;
    out.faces = faces.map((o, k) => {
      const r = rec[k];
      return { who: o.who, samples: r.n, blinks: r.blinkGeo, blinksCounted: o.f.blinks, gazeWhileSpeakingDeg: stat(r.gazeSpeak), gazeWhileListeningDeg: stat(r.gazeListen),
        maxStillS: +r.maxStill.toFixed(3), lipGapSpeakingMm: stat(r.gapSpeak), lipGapQuietMm: stat(r.gapQuiet), eyeTurnDeg: stat(r.cone), lidProbe: o.lid.map((L) => ({ i: L.i, openDeg: +(L.open / D2R).toFixed(1), shutDeg: +(L.shut / D2R).toFixed(1) })) };
    });
    out.note = 'the lids are counted from the deformed geometry; blinksCounted is the face\'s own counter since it was made (not the capture window)';
    out.stills = stills;
    void tf0;
  } catch (e) {
    out.error = String(e?.stack || e).slice(0, 600);
  } finally {
    for (const u of undo.reverse()) { try { u(); } catch (e) { /* */ } }
  }
  return out;
}

/* ======================================================================= F22: the routine log */

async function routineLog() {
  const C = window.__CTX__, PS = C.people, env = C.environment;
  const R = PS?.routines;
  if (!R) return { error: 'no routines' };
  const out = {};
  const questSpawned = [];
  const { WORK_CLIPS, bareClip } = await import('/src/world/npc/people/routines.js');
  try {
    // the log's clock from the start: a person adopted under the film's own hour (18:40, past the lamp's 18:30) would
    // begin at the lamp and then walk back up for the log's 18:00
    let h = 18.0;
    R.hourOf = () => h;
    R.force = true;
    // the crew from the town and the keeper
    const t0 = performance.now();
    while (performance.now() - t0 < 15000) {
      R._gather();
      if (R.list.length >= 6 || (R._keeper && R._keeper !== 'loading' && R.list.length >= (C.settlements?.town?.crew?.length || 0) + 1)) break;
      await sleep(250);
    }
    out.people = R.list.map((e) => e.id);
    if (!R.list.length) return { error: 'nobody adopted', crew: (C.settlements?.town?.crew || []).map((c) => c.id) };
    // (M1.5c/d fix round, judge item 9) Mise and Ansel are in the log too: the quest's (runtime.js _stagePeople stands them at
    // their anchors and the people system's idle beats run them); spawned here the same way if the film has not
    const SG = C.systemsGame, quest = [];
    for (const [who, arche, yaw, seed] of [['mise', 'lantern-keeper', 0.8, 68], ['ansel', 'guild-matron', 2.2, 64]]) {
      let q = SG?.people?.[who];
      if (!q && SG?.A?.[who] && PS.spawn) { q = await PS.spawn(arche, { x: SG.A[who].x, z: SG.A[who].z, yaw, seed }); questSpawned.push(q); }
      if (q) { q.group.visible = true; q._beatT = 0; q._beatEnd = 0; quest.push({ id: who, e: null, person: q }); }
    }
    out.quest = quest.map((t) => ({ id: t.id, spawnedByProbe: questSpawned.includes(t.person) }));
    const tracked = [...R.list.map((e) => ({ id: e.id, e, person: e.person })), ...quest];
    for (const t of tracked) PS.tierAt(t.person, 1);
    const Cl = C.collision;
    const probeV = { x: 0, y: 0, z: 0 };
    const V = (await import('/tools/look/three.mjs')).Vector3;
    const pv = new V(), up = new V(), lo = new V();
    const logs = tracked.map((t) => ({ id: t.id, acts: [], lastAct: null, changes: 0, still: 0, maxStill: 0, stillClip: null, anchor: null, noClip: 0, tpose: 0, inside: 0, wet: 0, walkRun: 0, maxWalk: 0, samples: 0, walked: 0, last: null, night: 0 }));
    const sea = C.water?.seaLevel ?? C.terrain?.seaLevel ?? null;
    const dt = 1 / 30;
    let simT = 0, nextSample = 0, steps = 0;
    while (h < 20.0) {
      h += env.clockRate(h) * dt;
      simT += dt;
      PS.update(dt, simT);
      steps++;
      if (simT >= nextSample) {
        nextSample += 0.25;
        tracked.forEach((T, k) => {
          const L = logs[k], p = T.person, g = p.group.position;
          const e = T.e || { id: T.id, night: false, phase: p.walking ? 'go' : 'do', act: p.walking ? 'walk' : (bareClip(p.current?.getClip().name) || 'none') };
          L.samples++;
          if (e.night) L.night++;
          if (e.id === 'lantern-keeper-2' && (L.samples % 20 === 1)) (L.trace ||= []).push([+h.toFixed(2), +g.x.toFixed(1), +g.z.toFixed(1), e.act, e.phase, p.walkTarget ? [+p.walkTarget.x.toFixed(1), +p.walkTarget.z.toFixed(1)] : null, +(p.speed || 0).toFixed(2)]);
          if (sea != null && g.y < sea - 0.05) L.wet++;
          const clip = bareClip(p.current?.getClip().name) || null;
          if (!clip) L.noClip++;
          // the bind pose: both upper arms within 15 deg of level AND out to the sides (|dot with the person's side| > 0.85;
          // a push holds them level but forward)
          let level = 0;
          const sx = Math.cos(p.yaw), sz = -Math.sin(p.yaw);
          for (const nm of ['upperarm_l', 'upperarm_r']) {
            const ua = p.bones[nm], la = p.bones[nm.replace('upper', 'lower')];
            if (!ua || !la) continue;
            ua.getWorldPosition(up); la.getWorldPosition(lo); lo.sub(up);
            const L = lo.length() || 1;
            const el = Math.asin(Math.max(-1, Math.min(1, lo.y / L))) / D2R;
            if (Math.abs(el) < 15 && Math.abs((lo.x * sx + lo.z * sz) / L) > 0.85) level++;
          }
          if (level === 2) L.tpose++;
          // activity changes (walking between is not an activity)
          if (e.act !== 'walk' && e.act !== L.lastAct) { if (L.lastAct && L.lastAct !== 'start') L.changes++; L.lastAct = e.act; L.acts.push([+h.toFixed(3), e.act]); }
          // stationary outside a work or seated clip
          if (L.last) L.walked += Math.hypot(g.x - L.last.x, g.z - L.last.z);
          L.last = { x: g.x, z: g.z };
          const working = clip && WORK_CLIPS.has(clip);
          if (!L.anchor || Math.hypot(g.x - L.anchor.x, g.z - L.anchor.z) > 0.25 || working) { L.anchor = { x: g.x, z: g.z }; L.still = 0; }
          else { L.still += 0.25; if (L.still > L.maxStill) { L.maxStill = L.still; L.stillClip = clip; L.stillAt = { x: +g.x.toFixed(2), z: +g.z.toFixed(2), act: e.act, h: +h.toFixed(3) }; } }
          // the longest walk (a walk that never ends is a person circling a mark)
          if (e.act === 'walk') { L.walkRun += 0.25; L.maxWalk = Math.max(L.maxWalk, L.walkRun); } else L.walkRun = 0;
          // inside a static blocking collider (the town, the breakwater): never another person
          if (Cl?.resolveCapsule) {
            pv.set(g.x, g.y, g.z);
            const r = Cl.resolveCapsule(pv, 0.25, 1.6, { passes: 1, filter: (c) => c.blocking && c.kind !== 'npc' && !c.dynamic });
            if (r?.hit) { L.inside++; if (!L.insideAt) L.insideAt = { x: +g.x.toFixed(2), z: +g.z.toFixed(2), act: e.act, kind: r.collider?.kind ?? null, id: r.collider?.id ?? null }; }
          }
        });
      }
      if (steps % 240 === 0) await sleep(0);
    }
    out.hours = [18.0, +h.toFixed(3)];
    out.simSeconds = +simT.toFixed(1);
    out.log = logs.map((L) => ({ id: L.id, changes: L.changes, acts: L.acts, maxStationaryOutsideWorkS: L.maxStill, stillClip: L.stillClip, stillAt: L.stillAt || null, longestWalkS: L.maxWalk, insideAt: L.insideAt || null, noClipSamples: L.noClip, bindPoseSamples: L.tpose, putOnMark: R.list.find((e) => e.id === L.id)?.stuck || 0, quest: quest.some((t) => t.id === L.id), trace: L.trace || null,
      insideColliderSamples: L.inside, belowSeaSamples: L.wet, samples: L.samples, walkedM: +L.walked.toFixed(1), nightSamples: L.night }));
    void probeV;
    out.lookout = await lookoutTrials(C, R, env, () => h, (v) => { h = v; });
  } catch (e) {
    out.error = String(e?.stack || e).slice(0, 600);
  } finally {
    R.hourOf = null;
    for (const e of R.list) PS.tierAt(e.person, null);
    for (const q of questSpawned) { try { PS.despawn(q); } catch (e) { /* */ } }
  }
  return out;
}

/**
 * M1.5d: the lookout's warning, live (src/world/npc/people/lookout.js). A real Instrument (the first kind this build spawns of
 * plumb, peg, gauge) is put 130 m from the lamp keeper, held there until the lookout is armed, then walked straight at her at
 * 1-6 m/s; each step the people system runs at 1/30 s and the Instrument's position is written before it. The delay is from
 * the first step the Instrument stood at 80 m or nearer to the step the 'npc-warning' event came. Ten trials, by day (12:00)
 * and at night (19:00) in turn. Bar: within 3 s.
 */
async function lookoutTrials(C, R, env, getH, setH) {
  const PS = C.people, M = C.machines, LK = R.lookout;
  if (!LK) return { error: 'no lookout' };
  const keeper = () => R.list.find((e) => e.id === 'lantern-keeper-2');
  if (!keeper()) return { error: 'no keeper adopted' };
  const kinds = ['plumb', 'peg', 'gauge'].filter((k) => (M?.canSpawn ? M.canSpawn(k) : !!M));
  if (!kinds.length) return { error: 'no Instrument kind spawns in this build' };
  const kp = keeper().person.group.position;
  const m = M.spawn(kinds[0], kp.x + 130, kp.z, { route: [{ x: kp.x + 130, z: kp.z }], heading: 0 });
  if (!m) return { error: `${kinds[0]} did not spawn` };
  const evs = [];
  const ev = C.events, emit0 = ev?.emit;
  if (ev) ev.emit = function (name, o) { if (name === 'npc-warning' || name === 'npc-all-clear') evs.push({ name, t: simT, ...o }); return emit0?.apply(this, arguments); };
  let simT = 0;
  const dt = 1 / 30;
  const put = (x, z) => { m.position.x = x; m.position.z = z; if (m.root) { m.root.position.x = x; m.root.position.z = z; } };
  const step = () => { setH(getH() + env.clockRate(getH()) * dt); simT += dt; PS.update(dt, simT); };
  const rows = [];
  try {
    for (let k = 0; k < 10; k++) {
      setH(k % 2 ? 19.0 : 12.0);
      // away, until armed (the all-clear needs 10 s past 100 m)
      for (let i = 0; i < 30 * 12 || (!LK.armed && i < 30 * 40); i++) { const p = keeper().person.group.position, b = (k * 37 + 11) * D2R; put(p.x + Math.sin(b) * 130, p.z + Math.cos(b) * 130); step(); if (i % 120 === 0) await sleep(0); }
      const others = () => { const p = keeper().person.group.position; let b = Infinity; for (const o of M.list) if (o !== m && o.alive !== false && !o._disposed && o.position) b = Math.min(b, Math.hypot(o.position.x - p.x, o.position.z - p.z)); return +b.toFixed(1); };
      if (!LK.armed) { rows.push({ k, error: 'not armed', nearestOtherM: others() }); continue; }
      const speed = 1 + k * 0.55;
      let crossed = null, fired = null, dNow = null;
      const n0 = evs.filter((e) => e.name === 'npc-warning').length;
      for (let i = 0; i < 30 * 60 && fired === null; i++) {
        const p = keeper().person.group.position, dx = p.x - m.position.x, dz = p.z - m.position.z, d = Math.hypot(dx, dz);
        if (d > 5) put(m.position.x + dx / d * speed * dt, m.position.z + dz / d * speed * dt);
        const p2 = keeper().person.group.position;
        dNow = Math.hypot(m.position.x - p2.x, m.position.z - p2.z);
        if (crossed === null && dNow <= 80) crossed = simT;
        step();
        if (evs.filter((e) => e.name === 'npc-warning').length > n0) fired = simT;
        if (i % 120 === 0) await sleep(0);
      }
      const w = evs.filter((e) => e.name === 'npc-warning')[n0];
      rows.push({ k, hour: k % 2 ? 19 : 12, speed: +speed.toFixed(2), crossedS: crossed, delayS: crossed !== null && fired !== null ? +(fired - crossed).toFixed(3) : null, atM: w?.d ?? null, line: w?.line?.join(' ') ?? null, nearestOtherM: others(), keeperAct: keeper().act, keeperClip: keeper().person.current?.getClip().name || null });
    }
  } finally {
    if (ev) ev.emit = emit0;
    try { const L = M.list, i = L.indexOf(m); if (i >= 0) L.splice(i, 1); m.dispose?.(); m.root?.parent?.remove(m.root); } catch (e) { /* */ }
  }
  const d = rows.map((r) => r.delayS).filter((x) => x != null);
  return { kind: kinds[0], trials: rows.length, fired: d.length, maxDelayS: d.length ? Math.max(...d) : null, bar: 3, rows, allClears: evs.filter((e) => e.name === 'npc-all-clear').length };
}
