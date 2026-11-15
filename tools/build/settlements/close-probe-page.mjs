/**
 * The M1b closing fix's one-session probe (settlements + people), run by
 *   node tools/frames/film.mjs --port <p> --only F20,F22,F24 --no-review --probe /tools/build/settlements/close-probe-page.mjs
 *
 *   F20  the crowd and its violet (tools/build/recipes/npc/cast-probe-page.mjs: in the world and with the town hidden; bar
 *        Brea >= 5x every other figure), and a close look at the near salt cone (its crust) from 2.5 m
 *   F22  the two-hour routine log with Mise and Ansel (tools/build/recipes/npc/m15-probe-page.mjs: Ansel's longest stand outside a
 *        working clip, bar 90 s), then Ansel's work and the quest talk: her clips over 30 s of beats, a card with her in its cast
 *        (she holds in talk), the card gone (her beats go on); a still of her tallying
 *   F24  the town's sky fill: the frame re-rendered at SKY_FILL 0, 1, 2 (the default) and 3.5, and the median luma of the
 *        town's wall pixels in each (the pixels the town changes against a town-less render)
 * Everything it touches is put back.
 */
export async function probe(frame) {
  if (frame?.id === 'F20') {
    const out = await (await import('/tools/build/recipes/npc/cast-probe-page.mjs')).probe(frame);
    try { out.cone = await coneLook(); } catch (e) { out.cone = { error: String(e?.message || e) }; }
    return out;
  }
  if (frame?.id === 'F22') {
    const out = await (await import('/tools/build/recipes/npc/m15-probe-page.mjs')).probe(frame);
    try { out.anselWork = await anselWork(); } catch (e) { out.anselWork = { error: String(e?.stack || e).slice(0, 500) }; }
    return out;
  }
  if (frame?.id === 'F24') return skyFill();
  return { skipped: 'measured on F20, F22 and F24 only' };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function coneLook() {
  const THREE = await import('/tools/look/three.mjs');
  const C = window.__CTX__, E = C.engine, cam = C.camera, T = C.settlements?.town;
  const { CONES } = await import('/src/world/settlements/saltrow-layout.js');
  if (!T?.loaded) return { error: 'no town' };
  const p0 = cam.position.clone(), q0 = cam.quaternion.clone(), f0 = cam.fov;
  const shots = {};
  try {
    for (const [i, c] of CONES.entries()) {
      const gy = C.terrain.getHeight(c.x, c.z);
      const d = new THREE.Vector3(C.player.position.x - c.x, 0, C.player.position.z - c.z).normalize();
      cam.position.set(c.x + d.x * (c.r + 2.5), gy + 1.4, c.z + d.z * (c.r + 2.5));
      cam.lookAt(c.x, gy + c.h * 0.45, c.z); cam.fov = 45; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      E.render(0);
      shots[`cone${i}`] = E.renderer.domElement.toDataURL('image/jpeg', 0.88);
    }
  } finally {
    cam.position.copy(p0); cam.quaternion.copy(q0); cam.fov = f0; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); E.render(0);
  }
  return { saltBound: T.uSaltK.value.z === 1, shots };
}

async function anselWork() {
  const C = window.__CTX__, PS = C.people, SG = C.systemsGame, E = C.engine, cam = C.camera;
  const { bareClip, WORK_CLIPS } = await import('/src/world/npc/people/routines.js');
  let ansel = SG?.people?.ansel, spawned = false;
  if (!ansel && SG?.A?.ansel) { ansel = await PS.spawn('guild-matron', { x: SG.A.ansel.x, z: SG.A.ansel.z, yaw: 2.2, seed: 64 }); spawned = true; }
  if (!ansel) return { error: 'no Ansel' };
  const pe0 = SG.people.ansel; SG.people.ansel = ansel;
  const pres = SG.present, card0 = pres?.card ?? null;
  const vis0 = ansel.group.visible;
  const out = { idleList: ansel.spec?.clips?.idle || null, beats: [], spawnedByProbe: spawned };
  const clip = () => bareClip(ansel.current?.getClip().name) || null;
  const step = async (sec) => { const dt = 1 / 30; for (let t = 0; t < sec; t += dt) PS.update(dt, 0); await sleep(0); };
  try {
    ansel.group.visible = true; ansel._beatT = 0; ansel._beatEnd = 0; PS.tierAt(ansel, 0);
    // her beats over 30 s: the clip at every second, the longest run outside a working clip
    let run = 0, maxRun = 0;
    for (let s = 0; s < 30; s++) {
      await step(1);
      const c = clip(); out.beats.push(c);
      if (c && WORK_CLIPS.has(c)) run = 0; else { run++; maxRun = Math.max(maxRun, run); }
      if (c === 'Interact' && !out.still) {
        await step(0.6);
        const B = ansel.bones || {}, hb = B.Head || B.head;
        const p0 = cam.position.clone(), q0 = cam.quaternion.clone(), f0 = cam.fov;
        const hp = ansel.group.position.clone(); if (hb) hb.getWorldPosition(hp); else hp.y += 1.5;
        const fy = ansel.group.rotation.y + 0.6;
        cam.position.set(hp.x + Math.sin(fy) * 2.6, hp.y - 0.3, hp.z + Math.cos(fy) * 2.6);
        cam.lookAt(hp.x, hp.y - 0.55, hp.z); cam.fov = 40; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
        E.render(0); out.still = E.renderer.domElement.toDataURL('image/jpeg', 0.88);
        cam.position.copy(p0); cam.quaternion.copy(q0); cam.fov = f0; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      }
    }
    out.maxSecondsOutsideWork = maxRun;
    // the quest talk: a card with her in its cast holds her in talk; the card gone, her beats go on
    if (pres) {
      out.beforeTalk = clip();
      pres.card = { who: 'ansel', text: 'probe', cast: ['ansel', 'brea'] };
      await step(2); out.inTalk = clip();
      await step(10); out.inTalkAfter10s = clip();
      pres.card = null;
      await step(1); out.afterTalk = clip();
      await step(9); out.afterTalk10s = clip();
    } else out.talk = 'no presenter';
  } finally {
    if (pres) pres.card = card0;
    PS.tierAt(ansel, null);
    ansel.group.visible = vis0;
    SG.people.ansel = pe0;
    if (spawned) PS.despawn(ansel);
  }
  return out;
}

async function skyFill() {
  const C = window.__CTX__, E = C.engine, R = E.renderer, T = C.settlements?.town;
  if (!T?.loaded) return { error: 'no town' };
  const W = R.domElement.width, H = R.domElement.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g2 = cv.getContext('2d', { willReadFrequently: true });
  const grab = () => { g2.drawImage(R.domElement, 0, 0); return g2.getImageData(0, 0, W, H).data; };
  const k0 = T.skyFill, out = { default: k0, variants: {} };
  try {
    T.group.visible = false; E.render(0); const bg = grab(); T.group.visible = true;
    for (const k of [0, 1, 2, 3.5]) {
      T.skyFill = k; T.update(0); E.render(0);
      const px = grab(); const Y = [];
      for (let i = 0; i < px.length; i += 4) {
        if (Math.max(Math.abs(px[i] - bg[i]), Math.abs(px[i + 1] - bg[i + 1]), Math.abs(px[i + 2] - bg[i + 2])) <= 12) continue;
        Y.push(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]);
      }
      Y.sort((a, b) => a - b);
      out.variants[k] = { townPx: Y.length, medianLuma: Y.length ? +Y[Y.length >> 1].toFixed(1) : null, p10: Y.length ? +Y[Math.floor(Y.length * 0.1)].toFixed(1) : null, p90: Y.length ? +Y[Math.floor(Y.length * 0.9)].toFixed(1) : null, shot: R.domElement.toDataURL('image/jpeg', 0.85) };
    }
  } finally {
    T.group.visible = true; T.skyFill = k0; T.update(0); E.render(0);
  }
  return out;
}
