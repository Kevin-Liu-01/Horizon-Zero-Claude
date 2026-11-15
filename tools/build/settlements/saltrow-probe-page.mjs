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

  const last = frame.id === 'F24' || (frame.id === 'F22' && !window.__saltrowKiteDone);
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
