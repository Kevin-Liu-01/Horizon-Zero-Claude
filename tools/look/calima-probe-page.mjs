/**
 * M1.1i WEATHER PROBE — the page half (lane world + sky). Run by tools/frames/film.mjs --probe after each frame is
 * staged and screenshotted (the world is frozen); tools/look/m11i-accept.mjs reads run.json and the PNGs.
 *
 *   probe(frame) -> {
 *     weather, hour, perception: { env, sightScale, live: [{ kind, sightRange, reach }], trade, night }
 *     visibility (F06 only): { cpu: { d05, d02, t: { m: T } }, cards: [{ d, T, yCard, yBg, contrast }], d05Rendered }
 *       black unlit cards (fogged like every surface) at 5 deg over the level, against the dust: the displayed
 *       luminance contrast of each against the ring around it; d05Rendered is where it crosses 5 % (interpolated)
 *     sun (F06 only, at the frame's hour and at 18:30): { elevDeg, profile: [{ deg, y, yNoBloom }], bg, discRadiusDeg,
 *       halo: { at6, at8, at10 }, bloomAt: { at6, at8 } }  8-bit display luminance (Rec.709 weights on the canvas'
 *       sRGB bytes) in 0.25-deg rings round the sun's centre, the lens turned onto the sun; bg = the 12-20 deg mean
 *     sky (F07 only): { maxSkyY, skyPx, depth: { w, h, dist } } the brightest sky pixel by the depth target (sky = -1)
 *   }
 * Reads window.__CTX__ (engine, camera, environment, machines) and /tools/look/three.mjs; every change is undone.
 */
export async function probe(frame) {
  const C = window.__CTX__, E = C.engine, env = C.environment, cam = C.camera, R = E.renderer;
  const THREE = await import('/tools/look/three.mjs');
  const D2R = Math.PI / 180;
  const out = { weather: env.weather, hour: env.time };
  const gl = R.getContext();
  const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
  const W = window.innerWidth, H = window.innerHeight;
  const sx = bw / W, sy = bh / H;
  const buf = new Uint8Array(bw * bh * 4);
  const read = () => { E.render(0); gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, buf); return buf; };
  const yAt = (b, x, y) => { const i = (y * bw + x) * 4; return 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2]; };
  const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const yLin = (b, x, y) => { const i = (y * bw + x) * 4; return 0.2126 * lin(b[i]) + 0.7152 * lin(b[i + 1]) + 0.0722 * lin(b[i + 2]); };
  const proj = (p) => { const q = p.clone().project(cam); return { x: (q.x * 0.5 + 0.5) * W, y: (0.5 - q.y * 0.5) * H, z: q.z }; };
  const r3 = (v) => Math.round(v * 1000) / 1000;

  /* ---- perception: the live multiplier and every live Instrument's reach ---- */
  try {
    const P = C.machines?.perception;
    P?.update?.(0);
    const list = (C.machines?.list || C.machines?.machines || C.machines?.active || []);
    const live = [];
    for (const m of (Array.isArray(list) ? list : [])) if (m && m.sightRange != null) live.push({ kind: m.kind || m.type || m.id, sightRange: m.sightRange, reach: r3(m.sightRange * (P?.sightScale ?? 1)) });
    out.perception = { env: env.perceptionScale, sightScale: P?.sightScale ?? null, weatherSeen: P?.weather ?? null, live: live.slice(0, 12), plumbReach: r3(48 * (P?.sightScale ?? env.perceptionScale)) };
  } catch (e) { out.perception = { error: String(e?.message || e) }; }

  if (frame?.id === 'F06') {
    /* ---- visibility: the CPU mirror along a level ray at the lens, and black cards in the rendered frame ---- */
    try {
      const fp = env.fogParams, y = cam.position.y;
      const T = (d) => fp.transmittance(d, y, y);
      const solve = (t) => { let a = 1, b = 5000; for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (T(m) > t) a = m; else b = m; } return Math.round((a + b) / 2 * 10) / 10; };
      const tt = {}; for (const d of [30, 60, 90, 120, 150, 180, 240, 300]) tt[d] = r3(T(d));
      out.visibility = { cpu: { d05: solve(0.05), d02: solve(0.02), t: tt, density: fp.density, opacity: env.u?.calFogB?.value?.z } };
      const f = cam.getWorldDirection(new THREE.Vector3()); f.y = 0; f.normalize();
      const right = new THREE.Vector3(-f.z, 0, f.x);
      const dists = [60, 90, 120, 150, 180, 240, 320];
      const mat = new THREE.MeshBasicMaterial({ color: 0x000000, fog: true, side: THREE.DoubleSide });
      env.registerMaterial?.(mat);
      const cards = [];
      dists.forEach((d, i) => {
        // across the frame's open left half, 5 deg over the level (at cc64d0d, 1.5 deg up, every card past 90 m stood
        // behind F06's ridge)
        const az = (-38 + i * 5) * D2R;
        const dir = f.clone().multiplyScalar(Math.cos(az)).addScaledVector(right, Math.sin(az));
        dir.y = Math.tan(5 * D2R); dir.normalize();
        const p = cam.position.clone().addScaledVector(dir, d);
        const size = 2 * d * Math.tan(1.6 * D2R);           // 3.2 deg square
        const g = new THREE.PlaneGeometry(size, size);
        const m = new THREE.Mesh(g, mat);
        m.position.copy(p); m.lookAt(cam.position); m.frustumCulled = false; m.renderOrder = 2;
        C.scene.add(m);
        cards.push({ d, m, p, size });
      });
      // the same pixels with and without the cards: each card's contrast against exactly what it hides
      const withC = read().slice();
      for (const c of cards) c.m.visible = false;
      const noC = read();
      const rows = [];
      for (const c of cards) {
        const s = proj(c.p);
        const pxR = (1.6 * D2R) / Math.tan(cam.fov * D2R / 2) * (H / 2) * 0.7;    // inside the card
        const cx = Math.round(s.x * sx), cy = Math.round((H - s.y) * sy), rIn = pxR * sx;
        let ci = 0, bi = 0, cn = 0, hid = 0;
        for (let yy = Math.floor(cy - rIn); yy <= cy + rIn; yy += 2) for (let xx = Math.floor(cx - rIn); xx <= cx + rIn; xx += 2) {
          if (xx < 0 || yy < 0 || xx >= bw || yy >= bh) continue;
          const a = yLin(withC, xx, yy), z = yLin(noC, xx, yy);
          if (Math.abs(a - z) < 1e-6) { hid++; continue; }     // something nearer than the card stands there
          ci += a; bi += z; cn++;
        }
        rows.push({ d: c.d, T: r3(T(c.d)), yCard: cn ? r3(ci / cn) : null, yBg: cn ? r3(bi / cn) : null, contrast: cn && bi > 0 ? r3((bi - ci) / bi) : null, seen: cn, hidden: hid, px: [Math.round(s.x), Math.round(s.y)] });
      }
      for (const c of cards) { C.scene.remove(c.m); c.m.geometry.dispose(); }
      mat.dispose();
      E.render(0);
      let d05 = null;
      for (let i = 0; i + 1 < rows.length; i++) {
        const a = rows[i], z = rows[i + 1];
        if (a.contrast != null && z.contrast != null && a.contrast >= 0.05 && z.contrast < 0.05) { d05 = Math.round((a.d + (z.d - a.d) * (a.contrast - 0.05) / (a.contrast - z.contrast)) * 10) / 10; break; }
      }
      out.visibility.cards = rows;
      out.visibility.d05Rendered = d05;
    } catch (e) { out.visibility = { ...(out.visibility || {}), error: String(e?.message || e) }; }

    /* ---- the sun: the lens turned onto it at the frame's hour and at 18:30, radial profile with and without bloom ---- */
    try {
      const pos0 = cam.position.clone(), q0 = cam.quaternion.clone(), fov0 = cam.fov, h0 = env.time;
      const L = E.look, bs0 = L.bloomScale;
      const sunAt = (h) => {
        if (h !== env.time) { env.setTime(h); }
        const sd = env.sunDir.clone().normalize();
        cam.fov = 40; cam.updateProjectionMatrix();
        cam.position.copy(pos0); cam.lookAt(pos0.clone().add(sd)); cam.updateMatrixWorld(true);
        const s0 = proj(pos0.clone().addScaledVector(sd, 1000));
        const pxPerDeg = (H / 2) / Math.tan(cam.fov * D2R / 2) * D2R;   // near the centre
        const prof = (b) => {
          const N = 80, acc = new Float64Array(N), n = new Uint32Array(N);
          const cx = s0.x * sx, cy = (H - s0.y) * sy, R1 = 20 * pxPerDeg * sx;
          for (let yy = Math.max(0, Math.floor(cy - R1)); yy < Math.min(bh, cy + R1); yy++) for (let xx = Math.max(0, Math.floor(cx - R1)); xx < Math.min(bw, cx + R1); xx++) {
            const r = Math.hypot(xx - cx, yy - cy) / (pxPerDeg * sx);
            const k = Math.floor(r / 0.25); if (k >= N) continue;
            acc[k] += yAt(b, xx, yy); n[k]++;
          }
          return Array.from(acc, (v, i) => (n[i] ? v / n[i] : null));
        };
        const on = prof(read());
        L.set({ bloomScale: 0 });
        const off = prof(read());
        L.set({ bloomScale: bs0 });
        const bgIdx = [], ring = (a, z) => { let s = 0, c = 0; for (let i = Math.round(a / 0.25); i < Math.round(z / 0.25); i++) if (on[i] != null) { s += on[i]; c++; } return c ? s / c : null; };
        const ringOff = (a, z) => { let s = 0, c = 0; for (let i = Math.round(a / 0.25); i < Math.round(z / 0.25); i++) if (off[i] != null) { s += off[i]; c++; } return c ? s / c : null; };
        const bg = ring(12, 20), peak = on[0];
        let rDisc = null; for (let i = 0; i < on.length; i++) if (on[i] != null && on[i] < (peak + bg) / 2) { rDisc = i * 0.25; break; }
        const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
        return {
          hour: env.time, elevDeg: Math.round(Math.asin(sd.y) / D2R * 10) / 10, px: [Math.round(s0.x), Math.round(s0.y)], bg: r1(bg), peak: r1(peak), discRadiusDeg: rDisc,
          halo: { at4: r1(ring(4, 5) - bg), at6: r1(ring(6, 7) - bg), at8: r1(ring(8, 9) - bg), at10: r1(ring(10, 11) - bg) },
          bloomAt: { at2: r1(ring(2, 3) - ringOff(2, 3)), at4: r1(ring(4, 5) - ringOff(4, 5)), at6: r1(ring(6, 7) - ringOff(6, 7)), at8: r1(ring(8, 9) - ringOff(8, 9)) },
          profile: on.filter((_, i) => i % 2 === 0).map((v, i) => ({ deg: i * 0.5, y: r1(v), yNoBloom: r1(off[i * 2]) })),
        };
      };
      out.sun = [sunAt(h0), sunAt(18.5)];
      if (env.time !== h0) { env.setTime(h0); }
      cam.position.copy(pos0); cam.quaternion.copy(q0); cam.fov = fov0; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
      E.render(0);
    } catch (e) { out.sun = { error: String(e?.message || e) }; }
  }

  if (frame?.id === 'F07') {
    /* ---- the brightest sky pixel, sky found by the depth target ---- */
    try {
      const GW = 400, GH = 225;
      const rt = new THREE.WebGLRenderTarget(GW, GH, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
      const mat = new THREE.ShaderMaterial({
        uniforms: { tDepth: { value: E.depthTexture } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: 'uniform sampler2D tDepth; varying vec2 vUv; void main() { float d = texture2D(tDepth, vUv).x; gl_FragColor = vec4(d >= 0.99999 ? 1.0 : 0.0, d, 0.0, 1.0); }',
        depthTest: false, depthWrite: false,
      });
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      const qs = new THREE.Scene(); qs.add(quad);
      const oc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      E.render(0);
      const prev = R.getRenderTarget();
      R.setRenderTarget(rt); R.render(qs, oc); R.setRenderTarget(prev);
      const dbuf = new Float32Array(GW * GH * 4);
      R.readRenderTargetPixels(rt, 0, 0, GW, GH, dbuf);
      rt.dispose(); mat.dispose(); quad.geometry.dispose();
      const b = read();
      let mx = 0, at = null, n = 0;
      const mask = new Array(GW * GH);
      for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
        const isSky = dbuf[(gy * GW + gx) * 4] > 0.5;      // readback rows bottom-up
        mask[(GH - 1 - gy) * GW + gx] = isSky ? 1 : 0;
        if (!isSky) continue;
        const x0 = Math.floor(gx * bw / GW), y0 = Math.floor(gy * bh / GH), x1 = Math.floor((gx + 1) * bw / GW), y1 = Math.floor((gy + 1) * bh / GH);
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const v = yAt(b, xx, yy); n++; if (v > mx) { mx = v; at = [Math.round(xx / sx), Math.round(H - yy / sy)]; } }
      }
      out.sky = { maxSkyY: Math.round(mx * 10) / 10, at, skyPx: n, mask: { w: GW, h: GH, rle: rle(mask) } };
    } catch (e) { out.sky = { error: String(e?.message || e) }; }
  }
  return out;
}

function rle(a) {
  const o = []; let v = a[0], c = 0;
  for (const x of a) { if (x === v) c++; else { o.push(c); v = x; c = 1; } }
  o.push(c);
  return { first: a[0], runs: o };
}
