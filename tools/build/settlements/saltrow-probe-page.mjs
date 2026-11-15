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
    try {
      const A = readback();
      town.group.visible = false; const B = readback(); town.group.visible = true;
      const sp0 = town.uSpill.value.clone(); town.uSpill.value.setRGB(0, 0, 0); const Cc = readback(); town.uSpill.value.copy(sp0);
      town.glass.visible = false; const D = readback(); town.glass.visible = true;
      const { bw, bh } = A;
      // the houses' screen rectangle (drawing-buffer px, y down), from every footprint corner at foot and parapet
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const b of town.buildings) {
        const c = Math.cos(b.yaw), sn = Math.sin(b.yaw);
        for (const [lx, lz] of [[-b.w / 2, -b.d / 2], [b.w / 2, -b.d / 2], [-b.w / 2, b.d / 2], [b.w / 2, b.d / 2]]) for (const yy of [b.y, b.y + b.h + 3]) {
          const q = new V3(b.x + c * lx + sn * lz, yy, b.z - sn * lx + c * lz).project(cam);
          const px = (q.x * 0.5 + 0.5) * bw, py = (0.5 - q.y * 0.5) * bh;
          x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
        }
      }
      x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(bw - 1, Math.ceil(x1)); y1 = Math.min(bh - 1, Math.ceil(y1));
      const near = [], far = [];
      let townPx = 0, glassPx = 0, maxGlassY = 0;
      const d = (P, Q, i) => Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]), Math.abs(P[i + 2] - Q[i + 2]));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = ((bh - 1 - y) * bw + x) * 4;
        if (d(A.raw, B.raw, i) <= 6) continue;            // not the town
        townPx++;
        if (d(A.raw, D.raw, i) > 6) { glassPx++; maxGlassY = Math.max(maxGlassY, Yof(A.raw, i)); continue; }
        (d(A.raw, Cc.raw, i) > 3 ? near : far).push(Yof(A.raw, i));
      }
      const med = (a) => { if (!a.length) return null; const b = Float32Array.from(a).sort(); return +b[b.length >> 1].toFixed(4); };
      const pct = (a, q) => { if (!a.length) return null; const b = Float32Array.from(a).sort(); return +b[Math.min(b.length - 1, Math.floor(b.length * q))].toFixed(4); };
      let sumY = 0, sr = 0, sg = 0, sb = 0, n = 0;
      for (let i = 0; i < A.raw.length; i += 4) { sumY += Yof(A.raw, i); sr += A.raw[i]; sg += A.raw[i + 1]; sb += A.raw[i + 2]; n++; }
      const mr = LIN[Math.round(sr / n)], mg = LIN[Math.round(sg / n)], mb = LIN[Math.round(sb / n)];
      out.walls = { rect: [x0, y0, x1, y1], buffer: [bw, bh], px: { town: townPx, glass: glassPx, near: near.length, far: far.length },
        medianY: { near: med(near), far: med(far) }, p90Far: pct(far, 0.9), farUnder003: far.length ? +(far.filter((v) => v < 0.03).length / far.length).toFixed(3) : null,
        maxGlassY: +maxGlassY.toFixed(3), frameY: { perPixel: +(sumY / n * 100).toFixed(2), ofMeans: +((0.2126 * mr + 0.7152 * mg + 0.0722 * mb) * 100).toFixed(2) },
        uNight: town.uNight?.value ?? null };
    } catch (e) { out.walls = { error: String(e?.message || e) }; town.group.visible = true; town.glass.visible = true; }
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
