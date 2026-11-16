/**
 * BUILD M1.5d and M1.3h — the people lane's live measurements and close stills, the page half. Run by
 *   node tools/frames/film.mjs --port <p> --only F14,F22 --no-review --probe /tools/build/recipes/npc/m1b-people-probe-page.mjs
 * after each frame is staged and shot (the world frozen by the film; this probe runs it again and freezes it after).
 *
 * F22 — M1.5d: the routine log over two in-game hours, the audit of every route's legs against the collision world and
 *       the lookout's ten live trials: ./m15-probe-page.mjs's own F22 probe, unchanged.
 * F14 — M1.3h: the slice's verbs on Brea, each played whole by the animator's `playVerb` (src/entities/anim/sliceVerbs.js),
 *       shot at three moments from two lenses so the hands read; then the Alidade raised (a lens at her face) and Brea
 *       seated on the home Brazier's seat (a low lens on her right, the stowed gear against the ground and the cistern).
 *       JPEG data URLs under `stills`; per verb its `verbInfo` at each moment and where it was staged (`stage`).
 *       Fix round 2 (judge items 4, 8, 9): the RAKE on the salt crust where F14 stands her, its lenses 3.0 m out with the
 *       frame's centre 0.8 m ahead of her so the head on the ground is in every moment; the CANE CUT at the edge of a reed
 *       bed (the nearest carrizo to the slice's cut-cane spot, `systemsGame.A.cane`, found on the live reed mask: she
 *       stands 0.9 m outside it facing in); the KINDLE at the home Brazier's bowl (0.85 m off it on the side away from
 *       the seat and the cistern, facing it).
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function probe(frame) {
  if (frame?.id === 'F22') return (await import('/tools/build/recipes/npc/m15-probe-page.mjs')).probe(frame);
  if (frame?.id === 'F14') return verbStills();
  return { skipped: 'measured on F14 and F22 only' };
}

async function verbStills() {
  const C = window.__CTX__, E = C.engine, R = E.renderer, cam = C.camera, p = C.player, an = p.animator;
  const THREE = await import('/tools/look/three.mjs');
  const out = { stills: {}, info: {} };
  const ts0 = E.timeScaleSources?.().studio;
  E.requestTimeScale('studio', null);
  const c0 = cam.position.clone(), q0 = cam.quaternion.clone(), fov0 = cam.fov;
  const grab = () => R.domElement.toDataURL('image/jpeg', 0.9);
  const v = new THREE.Vector3(), f = new THREE.Vector3(), r = new THREE.Vector3(), tgt = new THREE.Vector3();
  /** a lens `dist` m from her at `ang` deg round from her front (positive: her right), `h` m up, looking at `look` m up;
   *  `fwd` m moves the frame's centre (the lens and its target) ahead of her along her heading */
  const shoot = (ang, dist, h, look, fov = 38, fwd = 0) => {
    const hd = p.heading, a = hd - ang * Math.PI / 180;
    f.set(Math.sin(a), 0, Math.cos(a));
    r.set(Math.sin(hd), 0, Math.cos(hd)).multiplyScalar(fwd);
    v.copy(p.position).add(r).addScaledVector(f, dist); v.y = p.position.y + h;
    tgt.copy(p.position).add(r); tgt.y += look;
    cam.position.copy(v); cam.fov = fov; cam.updateProjectionMatrix(); cam.lookAt(tgt); cam.updateMatrixWorld();
    E.render(0);
    return grab();
  };
  const home = { x: p.position.x, z: p.position.z, heading: p.heading };
  const standAt = async (x, z, heading) => { p.position.set(x, 0, z); p.velocity?.set(0, 0, 0); p._snapToGround?.(); p.heading = heading; await sleep(500); };
  /** the cane: the nearest carrizo bed cell to the slice's cut-cane spot whose edge she can stand at, facing in */
  const caneSpot = () => {
    const RC = C.terrain?.reedCover, W = C.water;
    if (!RC?.cover) return { error: 'no reed mask' };
    const A = C.systemsGame?.A?.cane || home;
    const dry = (x, z) => !(W?.depthAt && W.depthAt(x, z) > 0.02);
    for (let rr = 0; rr <= 140; rr += 1.5) {
      const n = Math.max(1, Math.round(rr * 2));
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2, x = A.x + Math.sin(a) * rr, z = A.z + Math.cos(a) * rr;
        if (RC.cover(x, z) < 0.7) continue;
        const bed = RC.bedAt?.(x, z);
        if (bed && bed.kind != null && bed.kind !== 1 && bed.kind !== 'carrizo') continue;
        for (let j = 0; j < 24; j++) {
          const b = j / 24 * Math.PI * 2, sx = x - Math.sin(b) * 0.9, sz = z - Math.cos(b) * 0.9;
          if (RC.cover(sx, sz) < 0.15 && RC.cover(x + Math.sin(b) * 0.7, z + Math.cos(b) * 0.7) >= 0.6 && dry(sx, sz)) return { x: sx, z: sz, heading: b, bed: { x: +x.toFixed(2), z: +z.toFixed(2), cover: +RC.cover(x, z).toFixed(2), kind: bed?.kind ?? null }, fromCaneAnchorM: +rr.toFixed(1) };
        }
      }
    }
    return { error: 'no reed bed edge within 140 m of the cut-cane spot' };
  };
  try {
    await C.people?.bank?.loadClips?.();
    const plan = { rake: [0.9, 1.6, 2.5], caneCut: [0.7, 1.2, 1.75], kindle: [0.8, 1.35, 2.0] };
    const B = C.braziers?.byId?.('cistern');
    for (const [verb, times] of Object.entries(plan)) {
      // where: the rake on F14's crust; the cut at a reed bed's edge; the kindle at the home Brazier's bowl
      let stage = { at: 'F14 crust' }, face = null;
      if (verb === 'caneCut') {
        const c = caneSpot();
        if (!c.error) { await standAt(c.x, c.z, c.heading); stage = { at: 'reed bed edge', ...c }; } else stage = { at: 'F14 crust', ...c };
      } else if (verb === 'kindle') {
        if (B?.obj?.position) {
          const o = B.obj.position, b = 300 * Math.PI / 180, x = o.x + Math.sin(b) * 0.85, z = o.z - Math.cos(b) * 0.85;
          await standAt(x, z, Math.atan2(o.x - x, o.z - z));
          face = { x: o.x, z: o.z };
          stage = { at: 'home Brazier bowl', dBowlM: +Math.hypot(o.x - x, o.z - z).toFixed(2) };
        } else stage = { at: 'F14 crust', error: 'no home Brazier' };
      } else if (Math.hypot(p.position.x - home.x, p.position.z - home.z) > 0.5) await standAt(home.x, home.z, home.heading);
      // stand still a moment, then the verb
      await sleep(400);
      const len = an.playVerb(verb, face ? { face } : {});
      out.info[verb] = { len, at: [], stage };
      if (!len) { out.info[verb].error = 'did not start'; continue; }
      for (let i = 0; i < times.length; i++) {
        const w0 = performance.now();
        while ((an.verbInfo()?.t ?? 0) < times[i] && performance.now() - w0 < 8000) await new Promise((res) => requestAnimationFrame(res));
        out.info[verb].at.push(JSON.parse(JSON.stringify(an.verbInfo())));
        if (verb === 'rake') {
          // the head on the ground about 1.6 m ahead: both lenses 3.0 m out, the frame's centre 0.8 m ahead of her
          out.stills[`${verb}-${i}-front`] = shoot(-40, 3.0, 1.0, 0.55, 46, 0.8);
          out.stills[`${verb}-${i}-side`] = shoot(85, 3.0, 0.9, 0.5, 46, 0.8);
        } else {
          out.stills[`${verb}-${i}-front`] = shoot(-35, 2.3, 0.95, 0.7, 42);
          out.stills[`${verb}-${i}-side`] = shoot(80, 2.2, 0.9, 0.65, 42);
        }
      }
      const w1 = performance.now();
      while (an.verbInfo()?.w > 0 && performance.now() - w1 < 8000) await new Promise((res) => requestAnimationFrame(res));
    }
    // the Alidade raised: a lens at her face, front-right
    C.sighting?.toggle?.(true);
    await sleep(1200);
    out.stills['alidade-front'] = shoot(-30, 1.3, 1.55, 1.5, 34);
    out.stills['alidade-side'] = shoot(90, 1.2, 1.5, 1.5, 34);
    C.sighting?.toggle?.(false);
    await sleep(500);
    // seated at the home Brazier: stand her 2 m off its seat and sit her (the Braziers' own seat hold)
    if (B?.obj?.seat) {
      const s = B.obj.seat;
      p.position.set(s.x + 1.2, 0, s.z + 1.2); p.velocity?.set(0, 0, 0); p._snapToGround?.();
      await sleep(600);
      const ok = C.braziers.seatHere();
      await sleep(1600);
      out.info.sit = { seated: ok, riding: !!p.riding, cistern: B.obj.cistern || null };
      out.stills['sit-right'] = shoot(-95, 1.9, 0.6, 0.45, 40);
      out.stills['sit-back'] = shoot(160, 1.9, 0.7, 0.45, 40);
      C.braziers.stand?.();
      await sleep(400);
    } else out.info.sit = { error: 'no home Brazier' };
  } catch (e) {
    out.error = String(e?.stack || e).slice(0, 600);
  } finally {
    cam.position.copy(c0); cam.quaternion.copy(q0); cam.fov = fov0; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    E.requestTimeScale('studio', ts0 ?? 0);
  }
  return out;
}
