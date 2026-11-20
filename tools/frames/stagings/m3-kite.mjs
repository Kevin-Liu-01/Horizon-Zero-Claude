/**
 * MILESTONE 3 KITE STAGINGS (area B, the Survey Kite; M3 briefs §3.3, wave 1 blockout). Merged by
 * tools/frames/stagings/index.mjs like every lane file; filmed or measured only when named
 * (`film.mjs --only F51,F52`, `tools/perf/attrib.mjs --frames F51,F52`).
 *
 *   F51  the flight frame at blockout: a REAL launch, a jump off T2's pillar (Ninewalls Rise, the Holds) and Space at
 *        0.35 s (flight.js openHeightOffTop), the kite flown on heading 218 with no hand on the bar for 20 s of sim time
 *        by the flight law itself (src/game/kite/flight.js stepFlight on the island's height, the environment's trade
 *        and area A's lift: tools/gates/kite/world.mjs, the same function the Node rows step), frozen there: 57.4 m over
 *        the Pans' ground at (-49.4, -417.3), the Sounding Ring 313 m off on bearing 288 and Saltrow 288 m on 311, both
 *        10-12 deg below the horizon. The lens stands off her left side, looking past her toward them.
 *   F52  the hang side-on at 4 m (Kevin's bars, no reference), at the same point of the same glide, the whole kite in
 *        frame.
 *   Both: Brea in the M1.3f chest-bar hang (src/entities/anim/hangPose.js) under the GREY kite
 *   (src/entities/anim/kite/greyKite.js), re-seated on the bar every frame. Nothing in play opens the kite before wave 3,
 *   so for the frame her own update is replaced by one that holds her where the law put her and runs only her lens, her
 *   animator and her rig (undone at unstage): the hang is the static blockout pose, not a flight clip.
 *   The frames' place and bearing are the law's 20 s point (`F51_AT`); tools/gates/kite/flight-law.test.mjs re-steps the
 *   law in Node and fails if they drift.
 */
export const lane = 'm3-kite';

/** the law's 20 s point of F51's glide (Node: tools/gates/kite/row0.mjs, R.c.F51) */
export const F51_AT = Object.freeze({ from: 'T2', headingDeg: 218, seconds: 20, e: -49.4, n: -417.3, y: 61.4, agl: 57.4 });

/** @type {ReadonlyArray<object>} */
export const FRAMES = Object.freeze([
  {
    id: 'F51', subject: 'the flight frame at blockout: Brea under the grey kite, 20 s into a glide off T2, 57 m over the Pans, golden', in: 'M3', hour: 18.25, weather: 'trade',
    at: { en: [F51_AT.e, F51_AT.n] }, bearing: F51_AT.headingDeg,
    // off her left side (bearing 120 from her), looking past her on bearing 300 toward the Ring (288) and Saltrow (311)
    camera: { mode: 'orbit', yawRel: 98, dist: 9, height: 3, target: { fwd: 4.2, side: -29.7, up: -6 }, fov: 55, lookAt: 'off' },
    state: { pose: 'idle', hud: false },
    ref: { written: 'two rectangular cells and at least 6 spars countable; the leading cell orchil-dyed (wave 2: grey here); both wrists in front of the head plane and at or below head height; the Ring and Saltrow below. Wave 1: the grey box-frame kite on the static hang, placed by the flight law 20 s into a real glide (57.4 m over the Pans against the brief\'s 60)' },
  },
  {
    id: 'F52', subject: 'the hang, side-on at 4 m (blockout: the grey kite)', in: 'M3', hour: 18.25, weather: 'trade',
    at: { en: [F51_AT.e, F51_AT.n] }, bearing: F51_AT.headingDeg,
    // (fix round 1: at fov 62 and 2.0 m the kite's top longeron, 2.7 m from the lens, was cut by the frame's top edge)
    camera: { mode: 'orbit', yawRel: 90, dist: 4, height: 2.3, target: { fwd: 0, side: 0, up: 2.3 }, fov: 72, lookAt: 'off' },
    state: { pose: 'idle', hud: false },
    ref: { written: "Kevin's bars (no reference): the bar at sternum-to-chin height, 0.30-0.40 m in front of the chest, elbows below the shoulders; never a hand behind the head; the whole kite in frame" },
  },
]);

const hangUnderKite = {
  async beforeFreeze(f, api) {
    const C = api.C, p = C.player, an = p.animator;
    const F = await import('/src/game/kite/flight.js');
    const W = await import('/tools/gates/kite/world.mjs');
    const S = await import('/src/world/island/sites.js');
    const { buildGreyKite, placeAtBar } = await import('/src/entities/anim/kite/greyKite.js');
    // the glide, by the law, in the page: the same world the Node rows step
    const T = S.TRIG.find((t) => t.id === 'T2');
    const y0 = F.openHeightOffTop(W.heightAt(T.x, T.z) + S.TRIG_TOP);
    const r = W.fly(W.islandWorld(), { x: T.x, y: y0, z: T.z, headingDeg: 218, maxS: 20 });
    const g = r.f;
    window.__kiteStage = { id: f.id, law: { e: +g.x.toFixed(2), n: +(-g.z).toFixed(2), y: +g.y.toFixed(2), agl: +g.agl.toFixed(2), t: r.t, state: r.state }, terrainY: +C.terrain.getHeight(g.x, g.z).toFixed(2) };
    if (Math.hypot(g.x - p.position.x, g.z - p.position.z) > 1) api.standIn(`F51's mark (${p.position.x.toFixed(1)}, ${(-p.position.z).toFixed(1)}) is not the law's 20 s point (${g.x.toFixed(1)}, ${(-g.z).toFixed(1)})`);
    api.standIn(`the grey blockout kite on the static M1.3f hang (wave 1): Brea held where the flight law puts her 20 s into the glide off T2, ${g.agl.toFixed(1)} m over the ground`);
    // hold her there: her own update replaced by her lens, her model, her animator and her rig only
    const u0 = p.update, hold = { x: g.x, y: g.y, z: g.z }, grounded0 = p.grounded;
    const K = buildGreyKite();
    const root = an.space?.root || p.model;
    let heroMesh = null; p.model.traverse((o) => { if (!heroMesh && o.isMesh) heroMesh = o; });
    if (heroMesh) K.mesh.layers.mask = heroMesh.layers.mask;
    root.add(K.group);
    // the kite's program built and linked before the frame (at f1f8364 F51, the first frame it was ever in, was filmed
    // with no kite at all: its program was still linking; F52, the second, drew it)
    try { C.engine.compileAsDrawn?.(K.group, C.camera, C.scene); await C.engine._awaitProgramsReady?.(10000); } catch (e) { api.standIn(`kite program warm: ${e.message}`); }
    an.setHangPose(true);
    p.update = function (dt, t) {
      this.position.set(hold.x, hold.y, hold.z); this.velocity?.set?.(0, 0, 0);
      this._updateCamera(Math.min(0.05, dt || 0), t);
      this.model.position.copy(this.position); this.model.rotation.y = this.heading;
      this.animator.update(dt, t);
      this.hero?.update(dt);
      const i = this.animator.hangPoseInfo?.();
      if (i) placeAtBar(K.group, root, i.bar);
    };
    api.undo(() => {
      p.update = u0; p.grounded = grounded0;
      try { an.setHangPose(false); } catch (e) { /* */ }
      K.group.parent?.remove(K.group); K.mesh.geometry.dispose(); K.mesh.material.dispose();
      p.position.y = 0; p._snapToGround?.();
    });
    // the hang settles on the wall clock (the static pose and her chains), then the frame freezes (page.mjs step 9)
    C.engine.requestTimeScale('studio', null);
    const t0 = performance.now();
    while (performance.now() - t0 < 2000) await api.frames(1);
    // the orbit lens never computes her occlusion fade: drawn whole (as the instruments' line-up frames)
    if ((p._fadeCur ?? 1) < 0.999 || (p.fade ?? 1) < 0.999 || p._fadeApplied !== 1) {
      p.fade = 1; p._fadeCur = 1; p._fadeApplied = -1;
      try { p._applyFade(1 / 60, performance.now() / 1000); } catch (e) { api.standIn(`hero fade not reset: ${e.message}`); }
    }
    // the page's read of the bars on the filmed pose (char = her model's frame)
    const V = p.position.constructor, b = an.b;
    const wp = (bone) => { bone.updateWorldMatrix(true, false); return new V().setFromMatrixPosition(bone.matrixWorld); };
    const head = wp(b.head.bone), fwd = new V(Math.sin(p.heading), 0, Math.cos(p.heading));
    const side = (s) => { const w = wp(b[`hand${s}`].bone), e = wp(b[`loArm${s}`].bone), sh = wp(b[`upArm${s}`].bone);
      return { wristFrontOfHeadM: +new V().subVectors(w, head).dot(fwd).toFixed(3), wristBelowHeadBoneM: +(head.y - w.y).toFixed(3), elbowOverShoulderM: +(e.y - sh.y).toFixed(3) }; };
    // is the kite drawable from this lens: in the scene, visible, on the lens's layers, inside its frustum, where on screen
    const cam = C.camera, kc = K.group.getWorldPosition(new V()), ndc = kc.clone().project(cam);
    let inScene = false; for (let o = K.group; o; o = o.parent) if (o === C.scene) inScene = true;
    K.mesh.geometry.computeBoundingSphere();
    const sph = K.mesh.geometry.boundingSphere.clone().applyMatrix4(K.mesh.matrixWorld);
    const M4 = cam.projectionMatrix.constructor, pm = new M4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    let inFrustum = null; try { const THREE = await import('three'); inFrustum = new THREE.Frustum().setFromProjectionMatrix(pm).intersectsSphere(sph); } catch (e) { inFrustum = `? ${e.message}`; }
    const vis = []; for (let o = K.mesh; o; o = o.parent) vis.push(o.visible ? 1 : 0);
    window.__kiteStage.read = { L: side('L'), R: side('R'), bar: an.hangPoseInfo?.() || null, kiteTris: K.triangles, hang: !!an._hangOn, kiteWorld: kc.toArray().map((v) => +v.toFixed(2)),
      drawable: { inScene, visibleChain: vis.join(''), layersOk: cam.layers.test(K.mesh.layers), inFrustum, ndc: ndc.toArray().map((v) => +v.toFixed(3)), sphereR: +sph.radius.toFixed(2), cam: cam.position.toArray().map((v) => +v.toFixed(2)), rootScale: root.getWorldScale(new V()).toArray().map((v) => +v.toFixed(3)), programs: C.engine.renderer?.info?.programs?.length ?? null } };
    // (the run's JSON keeps only the stand-in list: the page's read goes on it, marked as a read)
    api.standIn(`read (not a stand-in): ${JSON.stringify(window.__kiteStage)}`);
  },
};

/** @type {Record<string, { world?: Function, beforeFreeze?: Function }>} in-page hooks per frame id */
export const STAGINGS = { F51: hangUnderKite, F52: hangUnderKite };

/** @type {Record<string, 'sim' | 'wall'>} the glide is the law's sim time; the hang settles on the wall clock */
export const STAGED = { F51: 'wall', F52: 'wall' };
