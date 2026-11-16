/**
 * SALTROW PROBE — the page half (lane settlements, M1.5a / M1.5e). Run by tools/frames/film.mjs --probe after each
 * frame is staged and screenshotted (the world frozen):
 *
 *   node tools/frames/film.mjs --port 5260 --only F22,F07,... --no-review --label settlements-x \
 *        --probe /tools/build/settlements/saltrow-probe-page.mjs
 *
 *   probe(frame) -> {
 *     town:  { buildings, colliders, lamps, litWindows, tris, draws }
 *     crew:  [{ id, clip, tier, onScreen: [x, y] | null, distance }]   the people at work, against this frame's lens
 *     nav:   { streetOpen: k of n street-axis cells open, housesShut: k of n house centres blocked, path: points }
 *     kite:  { flying, at, line }                                        in this frame's hour
 *     kiteView (only on the LAST frame of the run, `frame.id === 'F24'` or `'F22'` when F24 is not filmed):
 *        the view from the cistern at 07:00 (the lens 3.4 m behind REST, 2.3 m up, looking on bearing 24, 8 deg up,
 *        55 deg): { onScreen: [x, y] (CSS px), sizePx, occluded, elevDeg, png (800 x 450, base64) }
 *   }
 *     walls (F07 only, fix round 1): four renders of the frozen frame read back (as filmed; the town hidden; the
 *        window spill off; the glass hidden) give the town's pixels, its glass, and the wall pixels the spill reaches
 *        (`near`) or not (`far`): { px, medianY: { near, far }, farUnder003, p90Far, maxGlassY, frameY: { perPixel,
 *        ofMeans } } (Y: linear relative luminance of the sRGB pixel)
 *     navBoxes (once a run, fix round 1): every yaw-box collider outside the town (survey steps, the pump tower, the
 *        fallen ring...): 8 nav paths across each, every segment sampled at 0.2 m against the box's footprint
 *        { boxes: [{ id, kind, name, at, half, paths, crossings, crossings03 }], total }
 *     views (on the kite-view frame, fix round 1): the same frame filmer staging run again inside the probe for
 *        (a) the kite from the cistern at 07:00 with the PLAYER'S chase camera (Brea at REST facing bearing 24, the
 *        chase lens at pitch 0 and looking up at -14) and (b) a candidate F22 from the guild square looking down
 *        the street on bearing 216 at 18:40 (for the orchestrator's sun-side ruling): each { onScreen, png }
 * Reads window.__CTX__ only; changes the hour and the lens for the kite view after the frame is filmed.
 */
export async function probe(frame) {
  const C = window.__CTX__, E = C.engine, env = C.environment, cam = C.camera, R = E.renderer;
  const town = C.settlements?.town;
  const out = { frame: frame.id };
  if (!town) return { error: 'no town' };
  const W = window.innerWidth, H = window.innerHeight;
  const V3 = cam.position.constructor;
  const scr = (x, y, z) => {
    const p = new V3(x, y, z).project(cam);
    if (p.z > 1 || p.z < -1) return null;
    const sx = (p.x * 0.5 + 0.5) * W, sy = (0.5 - p.y * 0.5) * H;
    return sx >= 0 && sx <= W && sy >= 0 && sy <= H ? [Math.round(sx), Math.round(sy)] : null;
  };
  out.town = { buildings: town.buildings.length, colliders: town.colliderCount ?? null, lamps: town.lamps.map((l) => l.id), litWindows: town.litWindows, tris: Math.round(town.stats.tris), draws: town.stats.draws,
    deckY: town.breakwater ? +(town.breakwater.y + 1.3).toFixed(2) : null, lensEyeY: +cam.position.y.toFixed(2) };
  out.crew = town.crew.map((c) => {
    const p = c.person, g = p?.group;
    return { id: c.id, clip: p?.current?.getClip?.().name ?? c.clip, held: c.clip, tier: p?.tier ?? null,
      onScreen: g ? scr(g.position.x, g.position.y + 1.0, g.position.z) : null, distance: g ? +g.position.distanceTo(cam.position).toFixed(1) : null, error: c.error };
  });
  const N = C.nav;
  if (N) {
    const { streetPoint, BUILDINGS, placeOf } = await import('/src/world/settlements/saltrow-layout.js');
    let open = 0, n = 0;
    for (let s = 2; s <= 44; s += 2) { const q = streetPoint(s, 0); n++; if (!N.blockedAt(q.x, q.z)) open++; }
    let shut = 0;
    for (const b of BUILDINGS) { const q = placeOf(b); if (N.blockedAt(q.x, q.z)) shut++; }
    const a = streetPoint(1, 0), g = streetPoint(42, 0), y = C.terrain.getHeight(a.x, a.z);
    const path = N.path(new V3(a.x, y, a.z), new V3(g.x, y, g.z));
    out.nav = { ready: N.ready, streetOpen: `${open} of ${n}`, housesShut: `${shut} of ${BUILDINGS.length}`, path: path ? path.length : null };
  }
  const K = town.kite;
  out.kite = K ? { flying: K.flying, hour: env.time, at: [+K.position.x.toFixed(1), +K.position.y.toFixed(1), +K.position.z.toFixed(1)], line: K.stats.lineM, onScreen: K.flying ? scr(K.position.x, K.position.y, K.position.z) : null } : null;

  const gl = R.getContext();
  const readback = () => {
    const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
    const hold = E._hold; E._hold = false;
    E.render(0); E.render(0);
    const raw = new Uint8Array(bw * bh * 4);
    gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    E._hold = hold;
    return { raw, bw, bh };
  };
  const pngOf = async ({ raw, bw, bh }, OW = 800, OH = 450) => {
    const img = new ImageData(OW, OH), kx = bw / OW, ky = bh / OH;
    for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
      const xx = Math.floor(x * kx), yy = Math.floor(y * ky), i = ((bh - 1 - yy) * bw + xx) * 4, o = (y * OW + x) * 4;
      img.data[o] = raw[i]; img.data[o + 1] = raw[i + 1]; img.data[o + 2] = raw[i + 2]; img.data[o + 3] = 255;
    }
    const cv = new OffscreenCanvas(OW, OH); cv.getContext('2d').putImageData(img, 0, 0);
    const buf = new Uint8Array(await (await cv.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 32768) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 32768));
    return btoa(bin);
  };
  const LIN = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const v = i / 255; LIN[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }
  const Yof = (a, i) => 0.2126 * LIN[a[i]] + 0.7152 * LIN[a[i + 1]] + 0.0722 * LIN[a[i + 2]];

  if (frame.id === 'F07' && town.body) {
    // the frame as filmed (read back), then one MASK render straight to the canvas (no post): every other object as
    // it is, the town's body drawn flat red with its window spill in green, its glass flat blue. Town pixels are then
    // exact: body with spill > 0 = `near` (within 6 m of a lit window: the kit's bake), spill 0 = `far`
    try {
      const A = readback();
      const { bw, bh } = A;
      const THREE_ = await import('three');
      const bodyMask = new THREE_.ShaderMaterial({ vertexShader: 'attribute float aSpill; varying float vS; void main(){ vS = aSpill; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'varying float vS; void main(){ gl_FragColor = vec4(1.0, clamp(vS, 0.0, 1.0), 0.0, 1.0); }', toneMapped: false, fog: false });
      const glassMask = new THREE_.MeshBasicMaterial({ color: 0x0000ff, toneMapped: false, fog: false });
      const m0 = town.body.material, g0 = town.glass.material;
      town.body.material = bodyMask; town.glass.material = glassMask;
      const scene = E.scene || C.scene;
      const tm = R.toneMapping, cs = R.outputColorSpace;
      R.toneMapping = THREE_.NoToneMapping; R.outputColorSpace = THREE_.LinearSRGBColorSpace;
      R.setRenderTarget(null); R.render(scene, cam);
      const Mk = new Uint8Array(bw * bh * 4);
      gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, Mk);
      R.toneMapping = tm; R.outputColorSpace = cs;
      town.body.material = m0; town.glass.material = g0;
      bodyMask.dispose(); glassMask.dispose();
      const near = [], far = [];
      let glassPx = 0, maxGlassY = 0, bodyPx = 0;
      // the houses only: the rows of pixels above the breakwater's deck (the town is 120-140 m off; the deck and the
      // lamp are the near foreground). A body pixel counts when it is pure mask red.
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const i = ((bh - 1 - y) * bw + x) * 4;
        const r = Mk[i], g = Mk[i + 1], b = Mk[i + 2];
        if (b > 250 && r < 5 && g < 5) { glassPx++; maxGlassY = Math.max(maxGlassY, Yof(A.raw, i)); continue; }
        if (r > 250 && b < 5) {
          bodyPx++;
          (g > 2 ? near : far).push(Yof(A.raw, i));
        }
      }
      // keep only the town's houses: drop pixels nearer than 60 m (the breakwater and its lamp) by a second split:
      // the probe's rectangle of the houses (drawing-buffer px) bounds them
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const bd of town.buildings) {
        const c = Math.cos(bd.yaw), sn = Math.sin(bd.yaw);
        for (const [lx, lz] of [[-bd.w / 2, -bd.d / 2], [bd.w / 2, -bd.d / 2], [-bd.w / 2, bd.d / 2], [bd.w / 2, bd.d / 2]]) for (const yy of [bd.y - 3, bd.y + bd.h + 3]) {
          const q = new V3(bd.x + c * lx + sn * lz, yy, bd.z - sn * lx + c * lz).project(cam);
          const px = (q.x * 0.5 + 0.5) * bw, py = (0.5 - q.y * 0.5) * bh;
          x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
        }
      }
      const nearH = [], farH = [];
      for (let y = Math.max(0, y0 | 0); y <= Math.min(bh - 1, Math.ceil(y1)); y++) for (let x = Math.max(0, x0 | 0); x <= Math.min(bw - 1, Math.ceil(x1)); x++) {
        const i = ((bh - 1 - y) * bw + x) * 4;
        if (Mk[i] > 250 && Mk[i + 2] < 5) (Mk[i + 1] > 2 ? nearH : farH).push(Yof(A.raw, i));
      }
      const med = (a) => { if (!a.length) return null; const q = Float32Array.from(a).sort(); return +q[q.length >> 1].toFixed(4); };
      const pct = (a, qq) => { if (!a.length) return null; const q = Float32Array.from(a).sort(); return +q[Math.min(q.length - 1, Math.floor(q.length * qq))].toFixed(4); };
      let sumY = 0, sr = 0, sg = 0, sb = 0, n = 0;
      for (let i = 0; i < A.raw.length; i += 4) { sumY += Yof(A.raw, i); sr += A.raw[i]; sg += A.raw[i + 1]; sb += A.raw[i + 2]; n++; }
      const mr = LIN[Math.round(sr / n)], mg = LIN[Math.round(sg / n)], mb = LIN[Math.round(sb / n)];
      out.walls = { houses: { rect: [x0 | 0, y0 | 0, Math.ceil(x1), Math.ceil(y1)], near: nearH.length, far: farH.length, medianY: { near: med(nearH), far: med(farH) }, p25Near: pct(nearH, 0.25), p75Near: pct(nearH, 0.75), p90Far: pct(farH, 0.9), farUnder003: farH.length ? +(farH.filter((v) => v < 0.03).length / farH.length).toFixed(3) : null },
        allBody: { px: bodyPx, near: near.length, far: far.length, medianY: { near: med(near), far: med(far) } },
        glass: { px: glassPx, maxY: +maxGlassY.toFixed(3) }, buffer: [bw, bh],
        frameY: { perPixel: +(sumY / n * 100).toFixed(2), ofMeans: +((0.2126 * mr + 0.7152 * mg + 0.0722 * mb) * 100).toFixed(2) }, uNight: town.uNight?.value ?? null };
      /* wave 4 fix (world lane, F07): the same frame re-rendered per variant of the town's night light (the spill's curve
       * and gain, the breakwater lamp's pool, the night bloom), each read as the frame is: the frame's mean luminance by
       * the filmer's formula and per pixel, the houses' near/far wall medians on the same mask, and the brightest pixel
       * of the top quarter (the sky). Each variant is put back before the next. The shipped one is listed first. */
      try {
        const L = E.look;
        const v0 = { pow: town.uSpillPow.value, spill: town.spillGain, lamp: town.lampGain, lr2: town.uLampR2?.value ?? 5.76, bloom: L?.bloomScale ?? null };
        const VARS = [{ id: 'shipped' }, { id: 'lamp0', lamp: 0 },
          ...[1.8, 2.4, 3.0].flatMap((r) => [5, 8, 12].map((g) => ({ id: `lamp${g}-r${r}`, lamp: g, lr: r }))), { id: 'pow1', pow: 1.0 },
          { id: 'pow2', pow: 2.0 }, { id: 'spill0.6', spill: 0.6 }, { id: 'bloom1', bloom: (v0.bloom ?? 1) / 0.45 }, { id: 'bloom0.25', bloom: (v0.bloom ?? 1) * 0.55 }];
        out.walls.variants = [];
        for (const v of VARS) {
          if (v.pow != null) town.uSpillPow.value = v.pow;
          if (v.spill != null) town.spillGain = v.spill;
          if (v.lamp != null) town.lampGain = v.lamp;
          if (v.lr != null) town.uLampR2.value = v.lr * v.lr;
          town.update(0);
          if (v.bloom != null && L?.set) L.set({ bloomScale: v.bloom });
          const B = readback();
          const nr = [], fr = [];
          for (let y = Math.max(0, y0 | 0); y <= Math.min(bh - 1, Math.ceil(y1)); y++) for (let x = Math.max(0, x0 | 0); x <= Math.min(bw - 1, Math.ceil(x1)); x++) {
            const i = ((bh - 1 - y) * bw + x) * 4;
            if (Mk[i] > 250 && Mk[i + 2] < 5) (Mk[i + 1] > 2 ? nr : fr).push(Yof(B.raw, i));
          }
          let sY = 0, r2 = 0, g2 = 0, b2 = 0, m2 = 0, skyMax = 0;
          for (let i = 0; i < B.raw.length; i += 4) { sY += Yof(B.raw, i); r2 += B.raw[i]; g2 += B.raw[i + 1]; b2 += B.raw[i + 2]; m2++; }
          for (let y = 0; y < (bh >> 2); y++) for (let x = 0; x < bw; x++) { const i = ((bh - 1 - y) * bw + x) * 4; skyMax = Math.max(skyMax, 0.2126 * B.raw[i] + 0.7152 * B.raw[i + 1] + 0.0722 * B.raw[i + 2]); }
          const om = (0.2126 * LIN[Math.round(r2 / m2)] + 0.7152 * LIN[Math.round(g2 / m2)] + 0.0722 * LIN[Math.round(b2 / m2)]) * 100;
          out.walls.variants.push({ id: v.id, pow: town.uSpillPow.value, spill: town.spillGain, lamp: town.lampGain, lampR: +Math.sqrt(town.uLampR2?.value ?? 0).toFixed(2), bloom: L?.bloomScale ?? null,
            frameY: { ofMeans: +om.toFixed(2), perPixel: +(sY / m2 * 100).toFixed(2) }, medianY: { near: med(nr), far: med(fr) }, p90Far: pct(fr, 0.9), skyTopQuarterMaxLuma: +skyMax.toFixed(1) });
          if (v.lamp != null) out.walls.variants[out.walls.variants.length - 1].png = await pngOf(B, 640, 360);
          town.uSpillPow.value = v0.pow; town.spillGain = v0.spill; town.lampGain = v0.lamp; town.uLampR2.value = v0.lr2; town.update(0);
          if (v.bloom != null && L?.set) L.set({ bloomScale: v0.bloom });
        }
        readback();
      } catch (e) { out.walls.variantsError = String(e?.message || e); }
    } catch (e) { out.walls = { error: String(e?.message || e) }; }
  }

  if (N && !window.__saltrowNavDone) {
    window.__saltrowNavDone = true;
    try {
      const cols = (C.collision.colliders || []).filter((c) => c && !c.dead && c.type === 'box' && c.ref !== town.body);
      const boxes = [];
      let total = 0;
      const inBox = (c, x, z, m) => {
        const rx = x - c.cx, rz = z - c.cz, cs = Math.cos(-c.yaw || 0), sn = Math.sin(-c.yaw || 0);
        const lx = rx * cs - rz * sn, lz = rx * sn + rz * cs;
        return Math.abs(lx) <= c.hx + m && Math.abs(lz) <= c.hz + m;
      };
      for (const c of cols) {
        const gy = C.terrain.getHeight(c.cx, c.cz);
        if (c.miny > gy + 1.6 || c.maxy < gy + 0.2) continue;   // not standing on the ground where a person walks
        const R0 = Math.hypot(c.hx, c.hz) + 4;
        let paths = 0, cross = 0, cross03 = 0;
        for (let k = 0; k < 8; k++) {
          const a = k * Math.PI / 4;
          const A = new V3(c.cx + Math.cos(a) * R0, gy, c.cz + Math.sin(a) * R0), G = new V3(c.cx - Math.cos(a) * R0, gy, c.cz - Math.sin(a) * R0);
          const pth = N.path(A, G);
          if (!pth || pth.length < 2) continue;
          paths++;
          for (let i = 0; i + 1 < pth.length; i++) {
            const L = Math.hypot(pth[i + 1].x - pth[i].x, pth[i + 1].z - pth[i].z), steps = Math.max(1, Math.ceil(L / 0.2));
            let hit = false, hit03 = false;
            for (let j = 0; j <= steps; j++) {
              const x = pth[i].x + (pth[i + 1].x - pth[i].x) * j / steps, z = pth[i].z + (pth[i + 1].z - pth[i].z) * j / steps;
              if (inBox(c, x, z, 0)) hit = true;
              if (inBox(c, x, z, 0.3)) hit03 = true;
            }
            if (hit) cross++;
            if (hit03) cross03++;
          }
        }
        total += cross;
        boxes.push({ id: c.id, kind: c.kind, name: c.ref?.name || c.ref?.userData?.id || null, at: [+c.cx.toFixed(1), +c.cz.toFixed(1)], half: [+c.hx.toFixed(2), +c.hz.toFixed(2)], paths, crossings: cross, crossings03: cross03 });
      }
      out.navBoxes = { boxes, total, agentRadius: N.agentRadius };
    } catch (e) { out.navBoxes = { error: String(e?.message || e) }; }
  }

  const last = frame.id === 'F24' || (frame.id === 'F22' && !window.__saltrowKiteDone);
  if (last && !window.__saltrowViewsDone) {
    window.__saltrowViewsDone = true;
    try {
      const P = await import('/tools/frames/page.mjs');
      const { streetPoint } = await import('/src/world/settlements/saltrow-layout.js');
      const S = await import('/src/world/island/sites.js');
      const views = {};
      const stage = async (f) => { await P.unstageFrame(); return P.stageFrame(f, { settleMs: 2600 }); };
      for (const pitch of [0, -14]) {
        const f = { id: `kite-chase-${pitch}`, hour: 7.0, weather: 'trade', at: 'rest', bearing: 24, camera: { mode: 'chase', pitch }, state: { pose: 'idle', hud: false } };
        const st = await stage(f);
        const K = town.kite;
        const on = K?.flying ? scr(K.position.x, K.position.y, K.position.z) : null;
        views[f.id] = { flying: !!K?.flying, onScreen: on, sizePx: on ? Math.abs((scr(K.position.x, K.position.y + 1.05, K.position.z)?.[1] ?? 0) - (scr(K.position.x, K.position.y - 1.05, K.position.z)?.[1] ?? 0)) : null,
          lens: [+cam.position.x.toFixed(1), +cam.position.y.toFixed(1), +cam.position.z.toFixed(1)], fov: +cam.fov.toFixed(1), standIns: st?.standIns || [], png: await pngOf(readback()) };
      }
      {
        const g = streetPoint(42.5, 0.6);
        const f = { id: 'F22-down-street', hour: 18.67, weather: 'trade', at: { en: [+g.x.toFixed(2), +(-g.z).toFixed(2)] }, bearing: 216, camera: { mode: 'eye', eye: 1.7, pitch: 2, fov: 55 }, state: { pose: 'idle', hud: false, crowd: true } };
        const st = await stage(f);
        views[f.id] = { at: f.at, lens: [+cam.position.x.toFixed(1), +cam.position.y.toFixed(1), +cam.position.z.toFixed(1)], standIns: st?.standIns || [], png: await pngOf(readback(), 1600, 900) };
      }
      void S;
      out.views = views;
    } catch (e) { out.views = { error: String(e?.message || e) }; }
  }

  if (K && last && !window.__saltrowKiteDone) {
    window.__saltrowKiteDone = true;
    try {
      const S = await import('/src/world/island/sites.js');
      const REST = S.REST, D2R = Math.PI / 180;
      env.setWeather?.('trade', 0);
      env.setTime(7.0);
      K.update(0.016);
      const B = 24, fw = { x: Math.sin(B * D2R), z: -Math.cos(B * D2R) };
      const gy = C.terrain.getHeight(REST.x, REST.z);
      const pos = new V3(REST.x - fw.x * 3.4, gy + 2.3, REST.z - fw.z * 3.4);
      const pitch = 8 * D2R;
      cam.position.copy(pos);
      cam.lookAt(pos.x + fw.x * 100, pos.y + Math.tan(pitch) * 100, pos.z + fw.z * 100);
      cam.fov = 55; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      const kp = K.position;
      const on = scr(kp.x, kp.y, kp.z);
      const top = scr(kp.x, kp.y + 1.05, kp.z), bot = scr(kp.x, kp.y - 1.05, kp.z);
      const d = Math.hypot(kp.x - pos.x, kp.z - pos.z);
      let occluded = null;
      if (C.collision?.raycast) {
        const dx = kp.x - pos.x, dy = kp.y - pos.y, dz = kp.z - pos.z, L = Math.hypot(dx, dy, dz);
        const hit = C.collision.raycast(pos.x, pos.y, pos.z, dx / L, dy / L, dz / L, L - 1.5);
        occluded = hit?.hit ? +hit.t.toFixed(1) : false;
      }
      let ground = 0;
      for (let u = 0.05; u < 1; u += 0.05) {
        const x = pos.x + (kp.x - pos.x) * u, z = pos.z + (kp.z - pos.z) * u, yy = pos.y + (kp.y - pos.y) * u;
        if (C.terrain.getHeight(x, z) > yy) ground++;
      }
      const hold = E._hold; E._hold = false;
      const gl = R.getContext(), bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
      E.render(0); E.render(0);
      const raw = new Uint8Array(bw * bh * 4);
      gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, raw);
      E._hold = hold;
      const OW = 800, OH = 450, img = new ImageData(OW, OH), kx = bw / OW, ky = bh / OH;
      for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
        const xx = Math.floor(x * kx), yy = Math.floor(y * ky), i = ((bh - 1 - yy) * bw + xx) * 4, o = (y * OW + x) * 4;
        img.data[o] = raw[i]; img.data[o + 1] = raw[i + 1]; img.data[o + 2] = raw[i + 2]; img.data[o + 3] = 255;
      }
      const cv = new OffscreenCanvas(OW, OH); cv.getContext('2d').putImageData(img, 0, 0);
      const blob = await cv.convertToBlob({ type: 'image/png' });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i += 32768) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 32768));
      out.kiteView = { hour: env.time, flying: K.flying, lens: { pos: [+pos.x.toFixed(1), +pos.y.toFixed(1), +pos.z.toFixed(1)], bearing: B, pitchDeg: 8, fov: 55 },
        onScreen: on, sizePx: top && bot ? Math.abs(top[1] - bot[1]) : null, elevDeg: +(Math.atan2(kp.y - pos.y, d) / D2R).toFixed(1),
        distance: +d.toFixed(1), occluded, terrainOverSightline: ground, png: btoa(bin) };
    } catch (e) { out.kiteView = { error: String(e?.message || e) }; }
  }
  return out;
}
