/**
 * M1.1f / M1.1g SKY PROBE — the page half (lane sky-look). Run by tools/frames/film.mjs --probe after a frame
 * is staged and screenshotted (the world is frozen), so the numbers describe the filmed frame exactly.
 * tools/look/m11-accept.mjs reads them beside the PNG.
 *
 *   probe(frame) -> {
 *     sun:   { elevDeg, inFrame, px: [x, y] (CSS px of the frame), pxPerDeg: { r1, r2, r4 } (ring radius in px
 *              of the circle 1, 2 and 4 degrees from the sun centre), discRadiusDeg (the sky shader's disc) },
 *     depth: { w, h, dist: [...] }  Euclidean metres per cell of a w x h grid over the frame (from the scene
 *              target's depth texture, every drawn surface counted; sky = -1)
 *     fog:   { t150, t30 }  the aerial-perspective transmittance (CPU mirror) along a level ray of 150 m / 30 m
 *     bloom: { on, strength, ring: [{ fromDeg, toDeg, dY }], frameDY, maxDY }  8-bit luminance the bloom adds,
 *              read back from the canvas with the bloom's strength as shipped and at 0 (same frozen frame)
 *     grade: { setA, setB, mix, gradeMix, ev, exposure }
 *   }
 * Reads only: window.__CTX__ (engine, camera, environment), /tools/look/three.mjs (the app's own three).
 */
export async function probe() {
  const C = window.__CTX__, E = C.engine, env = C.environment, cam = C.camera, R = E.renderer;
  const THREE = await import('/tools/look/three.mjs');
  const D2R = Math.PI / 180;
  const W = window.innerWidth, H = window.innerHeight;
  const out = {};

  /* ---- the sun on screen ---- */
  const sd = env.sunDir.clone().normalize();
  const proj = (dir) => {
    const p = cam.position.clone().addScaledVector(dir, 1000).project(cam);
    return { x: (p.x * 0.5 + 0.5) * W, y: (0.5 - p.y * 0.5) * H, z: p.z };
  };
  const s0 = proj(sd);
  const ring = (deg) => {
    // directions `deg` from the sun, in 12 bearings around it
    const up = Math.abs(sd.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(sd, up).normalize(), v = new THREE.Vector3().crossVectors(u, sd).normalize();
    let s = 0;
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      const d = sd.clone().multiplyScalar(Math.cos(deg * D2R))
        .addScaledVector(u, Math.sin(deg * D2R) * Math.cos(a)).addScaledVector(v, Math.sin(deg * D2R) * Math.sin(a));
      const p = proj(d);
      s += Math.hypot(p.x - s0.x, p.y - s0.y);
    }
    return Math.round(s / 12 * 100) / 100;
  };
  cam.getWorldDirection(new THREE.Vector3());
  const facing = cam.getWorldDirection(new THREE.Vector3()).dot(sd);
  out.sun = {
    elevDeg: Math.round(Math.asin(sd.y) / D2R * 100) / 100,
    inFrame: facing > 0 && s0.z < 1 && s0.x >= 0 && s0.x < W && s0.y >= 0 && s0.y < H,
    px: [Math.round(s0.x * 10) / 10, Math.round(s0.y * 10) / 10],
    pxPerDeg: { r1: ring(1), r2: ring(2) / 2, r4: ring(4) / 4 },
    discRadiusDeg: env.sky?.material?.uniforms?.uDiscRadius?.value != null
      ? env.sky.material.uniforms.uDiscRadius.value / D2R : 0.5,
  };

  /* ---- the depth of every drawn surface, from the scene target's depth texture ---- */
  {
    const GW = 400, GH = 225;
    const rt = new THREE.WebGLRenderTarget(GW, GH, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    const mat = new THREE.ShaderMaterial({
      uniforms: { tDepth: { value: E.depthTexture }, uNear: { value: cam.near }, uFar: { value: cam.far }, uProjInv: { value: cam.projectionMatrixInverse.clone() } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tDepth; uniform float uNear, uFar; uniform mat4 uProjInv; varying vec2 vUv;
        void main() {
          float d = texture2D(tDepth, vUv).x;
          if (d >= 0.99999) { gl_FragColor = vec4(-1.0, d, 0.0, 1.0); return; }
          vec4 p = uProjInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          p.xyz /= p.w;
          gl_FragColor = vec4(length(p.xyz), d, 0.0, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    const qs = new THREE.Scene(); qs.add(quad);
    const oc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const prev = R.getRenderTarget();
    R.setRenderTarget(rt); R.render(qs, oc); R.setRenderTarget(prev);
    const buf = new Float32Array(GW * GH * 4);
    R.readRenderTargetPixels(rt, 0, 0, GW, GH, buf);
    const dist = new Array(GW * GH);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      // readback rows run bottom-up; the grid is stored top-down like the PNG
      const v = buf[((GH - 1 - y) * GW + x) * 4];
      dist[y * GW + x] = v < 0 ? -1 : Math.round(v * 10) / 10;
    }
    rt.dispose(); mat.dispose(); quad.geometry.dispose();
    out.depth = { w: GW, h: GH, dist };
  }

  /* ---- haze along a level ray ---- */
  try {
    const a = cam.position, f = cam.getWorldDirection(new THREE.Vector3()); f.y = 0; f.normalize();
    out.fog = {
      t150: Math.round(env.fogTransmittance(a, a.clone().addScaledVector(f, 150)) * 1000) / 1000,
      t30: Math.round(env.fogTransmittance(a, a.clone().addScaledVector(f, 30)) * 1000) / 1000,
      density: env.fogParams?.density,
    };
  } catch (e) { out.fog = { error: String(e?.message || e) }; }

  /* ---- what the bloom adds (canvas readback, shipped strength vs 0) ---- */
  try {
    const gl = R.getContext();
    const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
    // the engine's own frame (look sync, culling, cascades, the folded post), then an immediate readback
    const read = () => { E.render(0); const b = new Uint8Array(bw * bh * 4); gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
    const b = E.bloom, L0 = E.look, bs0 = L0.bloomScale;
    const on = read();
    const s0b = b.strength;
    L0.set({ bloomScale: 0 });
    const off = read();
    L0.set({ bloomScale: bs0 });
    E.render(0);
    const sx = bw / W, sy = bh / H, cx = s0.x * sx, cy = (H - s0.y) * sy;   // readback origin is bottom-left
    const ppd = out.sun.pxPerDeg.r4 * sx;
    const bands = [[0, 1], [1, 2], [2, 4], [4, 8], [8, 16]].map(([a, z]) => ({ fromDeg: a, toDeg: z, s: 0, n: 0 }));
    let fs = 0, fn = 0, mx = 0;
    for (let y = 0; y < bh; y += 2) for (let x = 0; x < bw; x += 2) {
      const i = (y * bw + x) * 4;
      const yOn = 0.2126 * on[i] + 0.7152 * on[i + 1] + 0.0722 * on[i + 2];
      const yOff = 0.2126 * off[i] + 0.7152 * off[i + 1] + 0.0722 * off[i + 2];
      const d = yOn - yOff;
      fs += d; fn++; if (d > mx) mx = d;
      if (out.sun.inFrame) {
        const r = Math.hypot(x - cx, y - cy) / ppd;
        for (const q of bands) if (r >= q.fromDeg && r < q.toDeg) { q.s += d; q.n++; }
      }
    }
    out.bloom = {
      on: !!b.enabled, strength: s0b, threshold: b.threshold,
      ring: bands.map((q) => ({ fromDeg: q.fromDeg, toDeg: q.toDeg, dY: q.n ? Math.round(q.s / q.n * 100) / 100 : null })),
      frameDY: Math.round(fs / fn * 1000) / 1000, maxDY: Math.round(mx * 10) / 10,
    };
  } catch (e) { out.bloom = { error: String(e?.message || e) }; }

  /* ---- the same frame with the grade at 0 (AgX + the CALIMA look, no LUT, no vignette, no dither): the input
     tools/look/grade-sim.mjs re-grades offline. 800 x 450 PNG (2.5 x 2.5 device-pixel box means), as a data URL ---- */
  try {
    const gl = R.getContext(), L1 = E.look, gm0 = L1.gradeMix;
    const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
    L1.set({ gradeMix: 0 });
    E.render(0);
    const raw = new Uint8Array(bw * bh * 4);
    gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    L1.set({ gradeMix: gm0 });
    E.render(0);
    const OW = 800, OH = 450, img = new ImageData(OW, OH), kx = bw / OW, ky = bh / OH;
    for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
      const x0 = Math.floor(x * kx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * kx)), y0 = Math.floor(y * ky), y1 = Math.max(y0 + 1, Math.floor((y + 1) * ky));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = ((bh - 1 - yy) * bw + xx) * 4; r += raw[i]; g += raw[i + 1]; b += raw[i + 2]; n++; }
      const o = (y * OW + x) * 4; img.data[o] = r / n; img.data[o + 1] = g / n; img.data[o + 2] = b / n; img.data[o + 3] = 255;
    }
    const cv = new OffscreenCanvas(OW, OH); cv.getContext('2d').putImageData(img, 0, 0);
    const blob = await cv.convertToBlob({ type: 'image/png' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 32768) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 32768));
    out.ungraded = { w: OW, h: OH, png: btoa(bin), vignette: L1.vignette, aspect: W / H };
  } catch (e) { out.ungraded = { error: String(e?.message || e) }; }

  /* ---- round 2: who owns the white. Near-white canvas pixels (every channel >= 245) counted with each light,
     additive or emissive thing within 4 m of the hero switched off in turn (the frame stays frozen; each is
     restored): F20's white-hot flare at Brea's side ---- */
  try {
    const gl = R.getContext(), bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
    const b = new Uint8Array(bw * bh * 4);
    const count = () => { E.render(0); gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, b); let n = 0;
      for (let i = 0; i < b.length; i += 8) if (b[i] >= 245 && b[i + 1] >= 245 && b[i + 2] >= 245) n++; return n * 2; };
    const hp = C.player?.position || C.player?.mesh?.position;
    const cands = [];
    const wp = new THREE.Vector3();
    if (hp) C.scene.traverse((o) => {
      if (!o.visible) return;
      const m = o.material;
      const add = m && !Array.isArray(m) && m.blending === THREE.AdditiveBlending;
      const emi = m && !Array.isArray(m) && m.emissive && m.emissiveIntensity > 0 && (m.emissive.r + m.emissive.g + m.emissive.b) > 0;
      if (!(o.isLight && !o.isDirectionalLight && !o.isHemisphereLight) && !add && !emi) return;
      o.getWorldPosition(wp);
      const d = Math.hypot(wp.x - hp.x, wp.z - hp.z);
      if (d <= 4) cands.push({ o, d });
    });
    const base = count();
    const rows = [];
    for (const { o, d } of cands.slice(0, 24)) {
      let off;
      if (o.isLight) { const i0 = o.intensity; o.intensity = 0; off = count(); o.intensity = i0; }
      else { o.visible = false; off = count(); o.visible = true; }
      rows.push({ name: o.name || o.type, type: o.isLight ? o.type + ' ' + Math.round(o.intensity * 10) / 10 : (o.material?.type || o.type),
        parent: o.parent?.name || '', dist: Math.round(d * 100) / 100, white: off, drop: base - off });
    }
    E.render(0);
    out.hot = { white: base, of: Math.round(bw * bh), rows };
  } catch (e) { out.hot = { error: String(e?.message || e) }; }

  const L = E.look;
  out.grade = L ? { setA: L.setA, setB: L.setB, mix: L.lutMix, gradeMix: L.gradeMix, ev: L.ev, exposure: L.exposure, baseExposure: L.baseExposure,
    bloomScale: L.bloomScale, agx: E._agxOn, uGradeMix: E.grade?.uniforms?.uGradeMix?.value } : null;
  out.exposure = { renderer: R.toneMappingExposure, envBase: env.exposureBase, envEV: env.exposureEV, thrHdr: E._thrHdr ?? null,
    bloomThreshold: E.bloom?.threshold, bloomStrength: E.bloom?.strength, brightMax: E.bloom?.highPassUniforms?.uBrightMax?.value ?? null };
  out.hour = env.time;
  return out;
}
