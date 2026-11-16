/**
 * BUILD M1.5d and M1.3h — the people lane's live measurements and close stills, the page half. Run by
 *   node tools/frames/film.mjs --port <p> --only F14,F22 --no-review --probe /tools/build/recipes/npc/m1b-people-probe-page.mjs
 * after each frame is staged and shot (the world frozen by the film; this probe runs it again and freezes it after).
 *
 * F22 — M1.5d: the routine log over two in-game hours, the audit of every route's legs against the collision world and
 *       the lookout's ten live trials: ./m15-probe-page.mjs's own F22 probe, unchanged.
 * F14 — M1.3h: the slice's verbs on Brea on the salt crust at 13:00, each played whole by the animator's `playVerb`
 *       (src/entities/anim/sliceVerbs.js), shot at three moments from two close lenses (2.1 m three-quarter front on her
 *       right, 2.0 m on her left side, both at waist height looking at her hands) so the hands read; then the Alidade
 *       raised (a lens at her face) and Brea seated on the home Brazier's seat (a low lens on her right, the stowed gear
 *       against the ground and the cistern). JPEG data URLs under `stills`; per verb its `verbInfo` at each moment.
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
  /** a lens `dist` m from her at `ang` deg round from her front (positive: her right), `h` m up, looking at `look` m up */
  const shoot = (ang, dist, h, look, fov = 38) => {
    const hd = p.heading, a = hd - ang * Math.PI / 180;
    f.set(Math.sin(a), 0, Math.cos(a));
    v.copy(p.position).addScaledVector(f, dist); v.y = p.position.y + h;
    tgt.copy(p.position); tgt.y += look;
    cam.position.copy(v); cam.fov = fov; cam.updateProjectionMatrix(); cam.lookAt(tgt); cam.updateMatrixWorld();
    E.render(0);
    return grab();
  };
  try {
    await C.people?.bank?.loadClips?.();
    const plan = { rake: [0.9, 1.6, 2.5], caneCut: [0.7, 1.2, 1.75], kindle: [0.8, 1.35, 2.0] };
    for (const [verb, times] of Object.entries(plan)) {
      // stand still a moment, then the verb
      await sleep(400);
      const len = an.playVerb(verb);
      out.info[verb] = { len, at: [] };
      if (!len) { out.info[verb].error = 'did not start'; continue; }
      for (let i = 0; i < times.length; i++) {
        const w0 = performance.now();
        while ((an.verbInfo()?.t ?? 0) < times[i] && performance.now() - w0 < 8000) await new Promise((res) => requestAnimationFrame(res));
        out.info[verb].at.push(an.verbInfo());
        out.stills[`${verb}-${i}-front`] = shoot(-35, 2.1, 0.95, 0.75);
        out.stills[`${verb}-${i}-side`] = shoot(80, 2.0, 0.9, 0.7);
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
    const B = C.braziers?.byId?.('cistern');
    if (B?.obj?.seat) {
      const s = B.obj.seat;
      p.position.set(s.x + 1.2, 0, s.z + 1.2); p.velocity?.set(0, 0, 0); p._snapToGround?.();
      await sleep(600);
      const ok = C.braziers.seatHere();
      await sleep(1600);
      out.info.sit = { seated: ok, riding: !!p.riding };
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
