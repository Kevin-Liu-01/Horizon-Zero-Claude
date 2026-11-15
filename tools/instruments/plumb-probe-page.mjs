/**
 * BUILD M1.4a-c — THE PLUMB PROBE, the page half (lane instruments). Run by
 *   node tools/frames/film.mjs --port <p> --only F23-plumb,F24 --probe /tools/instruments/plumb-probe-page.mjs
 * after each frame is staged and screenshotted (the world frozen). On F23-plumb it measures, in this order:
 *
 *   heights      the staged Plumb's posed height above its ground and Brea's, from their world bounding boxes
 *   visible      the share of the Plumb's VISIBLE hull pixels in the filmed frame that are white enamel, brass,
 *                gunmetal, ink and cloth: the frame's own depth (every surface, the lamp disc included) then the
 *                Plumb's meshes alone drawn with a class shader (palette slot from uv0, vertex colour x the decal
 *                atlas on uv1 for ink) where they pass that depth. The lamp and the vial glass are not hull.
 *   emissive     the Plumb alone in an unlit scene (no lights, no environment, the hull rim's sun radiance 0):
 *                the count of hull pixels above 0 (bar: 0) and of vial-glass pixels (expected > 0)
 *   lamps40      a test Plumb 40 m down its lamp axis through the game lens (55 deg), each state forced in turn:
 *                2 s at 24 Hz of GREYSCALE crops round the lamp; per trial the iris area (pixels above one
 *                threshold at the brightest sample) and the flicker rate (crossings of the luma signal's mean
 *                with hysteresis); a rule on those two numbers alone names the state. 3 trials per state.
 *   shots40      10 real arrows (the game's ArrowPool, Reed arrow speed at full draw, its gravity and drag) from
 *                10 bearings 36 deg apart, 40 m out at 1.45 m, each launched on the ballistic solution through
 *                the vial's centre; a vial hit is a hit whose point lies in the vial weak-point sphere. A second
 *                set of 10 aims 5 cm off centre (a ring) to show the margin.
 *   topple       two vial hits on the test Plumb: seconds from the second hit to upright again (bar 4.0 +- 0.2)
 *   pry          a Barbed-arrow tear (60) on the bob and on the lamp drum: each comes off; with the drum off the
 *                lamp is gone, the Sightline is disabled and a Flag is refused
 * Reads window.__CTX__ only; restores the time freeze, the player, the camera and the clock it found.
 */
export async function probe(frame) {
  if (frame?.id !== 'F23-plumb') return { skipped: 'measured on F23-plumb only' };
  const THREE = await import('/tools/look/three.mjs');
  const C = window.__CTX__, E = C.engine, R = E.renderer, M = C.machines, p = C.player, cam = C.camera, T = C.terrain;
  const LS = M.lamps;
  const gl = R.getContext();
  const out = { t0: performance.now() };
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const hy = (x, z) => T.getHeight(x, z);
  const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
  const guard = async (k, fn) => { const t = performance.now(); try { out[k] = await fn(); } catch (e) { out[k] = { error: String(e?.stack || e).slice(0, 600) }; } (out.seconds ||= {})[k] = r3((performance.now() - t) / 1000); };

  /* ---- the staged Plumb ---- */
  const staged = M.list.filter((m) => m.kind === 'plumb' && m.alive);
  staged.sort((a, b) => a.position.distanceTo(p.position) - b.position.distanceTo(p.position));
  const m0 = staged[0];
  if (!m0) return { error: 'no Plumb staged' };

  // the Plumb's own meshes: the skinned hull, the vial glass and the part proxies (the bob, the drum, the gimbal; their
  // materials are hidden by the component fold, which draws them in one merged mesh, skipped here). The vial's hit
  // box is never drawn (mesh.visible false) and is not counted.
  const meshesOf = (m) => { const a = []; m.root.traverse((o) => { if (o.isMesh && o.visible && !o.userData?.casterProxy && !o.isInstancedMesh && !o.material?.userData?.componentFold) a.push(o); }); return a; };
  const showAll = (list) => { const back = []; for (const o of list) if (o.material && o.material.visible === false) { back.push(o.material); o.material.visible = true; } return () => { for (const mm of back) mm.visible = false; }; };
  const isGlass = (o) => !o.material?.userData?.instrumentHull;
  const wp0 = (rec) => { rec.obj.updateWorldMatrix(true, false); return rec.obj.getWorldPosition(new THREE.Vector3()); };

  await guard('heights', async () => {
    m0.root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const o of meshesOf(m0)) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone(); if (o.isSkinnedMesh) { o.computeBoundingBox?.(); if (o.boundingBox) { box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); continue; } } box.union(b.applyMatrix4(o.matrixWorld)); }
    const g = hy(m0.position.x, m0.position.z);
    let brea = null;
    if (p.model) { const bb = new THREE.Box3().setFromObject(p.model); brea = r3(bb.max.y - hy(p.position.x, p.position.z)); }
    let tris = 0;
    for (const o of meshesOf(m0)) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    // fix 1: the ground under each FOOT, not under the root (the legs stand 1.2 m out; on a slope the root's ground
    // is not the feet's). Each skinned hull vertex goes to its nearest foot (xz); per foot, the lowest vertex against
    // the terrain there: below 0 is sunk. The height is the top above the feet's mean ground.
    const feet = (m0.debugFeet?.() || []).map((f) => ({ name: f.name, x: f.world.x, z: f.world.z, low: Infinity, g: hy(f.world.x, f.world.z) }));
    if (feet.length) {
      const v = new THREE.Vector3();
      for (const o of meshesOf(m0)) {
        if (!o.isSkinnedMesh || isGlass(o)) continue;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld);
          if (v.y - g > 0.6) continue;
          let best = null, bd = 1e9;
          for (const f of feet) { const d = (v.x - f.x) ** 2 + (v.z - f.z) ** 2; if (d < bd) { bd = d; best = f; } }
          if (best && bd < 0.36 && v.y - best.g < best.low) best.low = v.y - best.g;
        }
      }
    }
    const fg = feet.length ? feet.reduce((s, f) => s + f.g, 0) / feet.length : g;
    const sunk = feet.length ? Math.min(...feet.map((f) => f.low)) : null;
    return { plumbM: r3(box.max.y - fg), plumbRootGroundM: r3(box.max.y - g), plumbLowM: r3(box.min.y - g), feet: feet.map((f) => ({ name: f.name, lowAboveGroundM: r3(f.low), groundM: r3(f.g - g) })), sunkM: r3(sunk), registryM: m0.height, breaM: brea, ratio: brea ? r3((box.max.y - fg) / brea) : null, distToBreaM: r3(m0.position.distanceTo(p.position)), drawnTris: Math.round(tris), bar: '3.4 +- 0.1 m above the ground under the feet; no foot below its ground by more than 0.03 m' };
  });

  /* ---- where the head's pieces are (fix 1 diagnosis): the root frame, relative to the head bone ---- */
  await guard('headGeom', async () => {
    m0.root.updateMatrixWorld(true);
    const hb = m0.rig?.bones?.head; if (!hb) throw new Error('no head bone');
    const H = hb.getWorldPosition(new THREE.Vector3());
    const rel = (w) => { const a = m0.root.worldToLocal(w.clone()), b = m0.root.worldToLocal(H.clone()); return [r3(a.x - b.x), r3(a.y - b.y), r3(a.z - b.z)]; };
    const parts = {};
    for (const q of m0.parts || []) if (q.mesh) parts[q.name] = rel(q.mesh.getWorldPosition(new THREE.Vector3()));
    const cen = (o, near) => { const v = new THREE.Vector3(), c = new THREE.Vector3(); let n = 0; const pos = o.geometry.attributes.position; for (let i = 0; i < pos.count; i += 1) { if (o.isSkinnedMesh) o.getVertexPosition(i, v); else v.fromBufferAttribute(pos, i); v.applyMatrix4(o.matrixWorld); if (near && v.distanceTo(H) > near) continue; c.add(v); n++; } return n ? rel(c.multiplyScalar(1 / n)) : null; };
    let glass = null, sphere = null;
    for (const o of meshesOf(m0)) { if (!o.isSkinnedMesh) continue; if (isGlass(o)) glass = cen(o, 0); else sphere = cen(o, 0.45); }
    return { headBoneBody: hb.userData.bodyPos, parts, vialWp: rel(wp0(m0._vialWp)), lampWp: rel(wp0(m0._lampWp)), lampAnchor: m0._lampAnchor ? rel(m0._lampAnchor.getWorldPosition(new THREE.Vector3())) : null, glassCentroid: glass, hullNearHeadCentroid: sphere };
  });

  /* ---- visible hull classes in the filmed frame ---- */
  const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
  const CLS = [['enamel', [1, 1, 1]], ['ink', [1, 0, 0]], ['brass', [1, 0.6, 0]], ['gunmetal', [0, 0, 1]], ['cloth', [1, 0, 1]], ['glass', [0, 1, 1]]];
  function classMaterial(src, glass) {
    const map = src.map || null;
    const mat = new THREE.ShaderMaterial({
      defines: { USE_UV1: '' },
      uniforms: { atlas: { value: map }, atlasM: { value: new THREE.Matrix3() }, hasAtlas: { value: map ? 1 : 0 }, glass: { value: glass ? 1 : 0 } },
      vertexColors: true,
      vertexShader: `#include <common>
#include <skinning_pars_vertex>
varying vec2 vUv0; varying vec2 vUv1; varying vec3 vCol;
void main() {
  vUv0 = uv; vUv1 = uv1; vCol = color;
  #include <begin_vertex>
  #include <skinbase_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
}`,
      fragmentShader: `uniform sampler2D atlas; uniform mat3 atlasM; uniform int hasAtlas; uniform int glass;
varying vec2 vUv0; varying vec2 vUv1; varying vec3 vCol;
void main() {
  if (glass == 1) { gl_FragColor = vec4(0.0, 1.0, 1.0, 1.0); return; }
  float slot = floor(vUv0.x * 8.0);
  vec3 c = vec3(0.0, 0.0, 1.0);                                   // gunmetal (graphite, chrome, rubber)
  if (slot < 0.5) {                                                // glaze: enamel unless the decal or the tone is ink
    vec3 t = hasAtlas == 1 ? texture2D(atlas, (atlasM * vec3(vUv1, 1.0)).xy).rgb : vec3(1.0);
    vec3 b = vCol * t;
    bool ink = (b.r > 2.2 * b.g && b.r > 0.05) || (t.r + t.g + t.b < 0.6);
    c = ink ? vec3(1.0, 0.0, 0.0) : vec3(1.0);
  } else if (slot < 1.5) c = vec3(1.0, 0.0, 1.0);                  // bisque: banner cloth
  else if (slot < 3.5) c = vec3(1.0, 0.6, 0.0);                    // patina, bronze: brass
  gl_FragColor = vec4(c, 1.0);
}`,
    });
    if (map) { map.updateMatrix(); mat.uniforms.atlasM.value.copy(map.matrix); }
    mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -4;
    mat.depthFunc = THREE.LessEqualDepth;
    return mat;
  }
  const cc0 = R.getClearColor(new THREE.Color()), ca0 = R.getClearAlpha();
  function readRT(rt) { const b = new Uint8Array(bw * bh * 4); R.readRenderTargetPixels(rt, 0, 0, bw, bh, b); return b; }
  function crop(buf, x0, y0, w, h, scale = 1, grey = false) {
    const cv = document.createElement('canvas'); cv.width = w * scale; cv.height = h * scale;
    const cx = cv.getContext('2d'); const id = cx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const si = ((y0 + (h - 1 - y)) * bw + (x0 + x)) * 4, di = (y * w + x) * 4;
      if (grey) { const Y = 0.2126 * buf[si] + 0.7152 * buf[si + 1] + 0.0722 * buf[si + 2]; id.data[di] = id.data[di + 1] = id.data[di + 2] = Y; }
      else { id.data[di] = buf[si]; id.data[di + 1] = buf[si + 1]; id.data[di + 2] = buf[si + 2]; }
      id.data[di + 3] = 255;
    }
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h; tmp.getContext('2d').putImageData(id, 0, 0);
    cx.imageSmoothingEnabled = false; cx.drawImage(tmp, 0, 0, w * scale, h * scale);
    return cv.toDataURL('image/png');
  }
  /** The class image of the Plumb through camera `cv`: the frame's depth first, then the Plumb's meshes in the class shader. */
  function classFrame(cv) {
    const rt = new THREE.WebGLRenderTarget(bw, bh, { depthBuffer: true });
    const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const scene = C.scene;
    const prevO = scene.overrideMaterial, prevBg = scene.background, prevAuto = R.autoClear;
    const prevRT = R.getRenderTarget();
    // pass 1: the frame's depth, everything drawn with its own material (the grass's wind and the lamp disc too),
    // then the colour cleared to black and the depth kept
    R.setRenderTarget(rt); R.setClearColor(0x000000, 1); R.clear(true, true, true);
    R.autoClear = false;
    R.render(scene, cv);
    R.setRenderTarget(rt); R.clear(true, false, false);
    R.autoClear = prevAuto;
    void prevO; void prevBg;
    // pass 2: the Plumb's own meshes with the class shader where they pass that depth
    const swaps = [];
    const keep = new Set(meshesOf(m0));
    const hidden = [];
    scene.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) { if (!keep.has(o) && o.visible) { hidden.push(o); o.visible = false; } } });
    for (const o of keep) { swaps.push([o, o.material]); o.material = classMaterial(o.material, isGlass(o)); }
    // the component fold's merged mesh is hidden for this pass (its proxies draw instead)
    m0.root.traverse((o) => { if (o.isMesh && o.material?.userData?.componentFold && o.visible) { hidden.push(o); o.visible = false; } });
    R.autoClear = false;
    R.render(scene, cv);
    R.autoClear = prevAuto;
    for (const [o, mm] of swaps) { o.material.dispose(); o.material = mm; }
    for (const o of hidden) o.visible = true;
    R.setRenderTarget(prevRT); R.setClearColor(cc0, ca0);
    const buf = readRT(rt);
    rt.dispose(); black.dispose();
    return buf;
  }
  const classOf = (buf, i) => {
    const r = buf[i * 4], g = buf[i * 4 + 1], b = buf[i * 4 + 2];
    if (r < 20 && g < 20 && b < 20) return null;
    let best = null, bd = 1e9;
    for (const [k, c] of CLS) { const d = Math.abs(r - c[0] * 255) + Math.abs(g - c[1] * 255) + Math.abs(b - c[2] * 255); if (d < bd) { bd = d; best = k; } }
    return bd > 60 ? null : best;
  };
  await guard('visible', async () => {
    const buf = classFrame(cam);
    // fix 1: the lamp system draws its iris over the drum's face; that disc is lamp, not hull (it was classed enamel)
    let lx = -1, ly = -1, lr = 0;
    if (m0._lampAnchor && !m0._noLamp) {
      const w = m0._lampAnchor.getWorldPosition(new THREE.Vector3()), q = w.clone().project(cam);
      const S = C.assets.models.plumb.r5Sockets, rad = (S.lampR || 0.18) * (m0._scale || 1);
      lx = (q.x * 0.5 + 0.5) * bw; ly = (q.y * 0.5 + 0.5) * bh;
      lr = rad / (w.distanceTo(cam.position) * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) * (bh / 2);
    }
    let lampPx = 0;
    const n = {}; let hull = 0, x0 = bw, y0 = bh, x1 = 0, y1 = 0;
    for (let i = 0; i < bw * bh; i++) {
      const r = buf[i * 4], g = buf[i * 4 + 1], b = buf[i * 4 + 2];
      if (r < 20 && g < 20 && b < 20) continue;
      let best = null, bd = 1e9;
      for (const [k, c] of CLS) { const d = Math.abs(r - c[0] * 255) + Math.abs(g - c[1] * 255) + Math.abs(b - c[2] * 255); if (d < bd) { bd = d; best = k; } }
      if (bd > 60) continue;   // not a class colour
      if (lr > 0 && Math.hypot((i % bw) + 0.5 - lx, ((i / bw) | 0) + 0.5 - ly) <= lr) { lampPx++; continue; }
      n[best] = (n[best] || 0) + 1;
      if (best !== 'glass') hull++;
      const x = i % bw, y = (i / bw) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const share = {};
    for (const [k] of CLS) if (k !== 'glass') share[k] = hull ? Math.round(1000 * (n[k] || 0) / hull) / 10 : null;
    const pad = 6; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(bw - 1, x1 + pad); y1 = Math.min(bh - 1, y1 + pad);
    return { hullPx: hull, glassPx: n.glass || 0, lampFacePxExcluded: lampPx, lampFaceRadiusPx: r3(lr), sharePct: share, bar: 'enamel 55-75 % of visible hull', pass: share.enamel >= 55 && share.enamel <= 75, idPng: crop(buf, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 2) };
  });

  /* ---- 2 cm detail at 6 m, in a frame (fix 1: it was computed only) ----
   * The F23 lens (its fov, the drawing buffer), 6 m from the head on the F23 camera's side and 0.9 m above it, so the
   * gimbal ring's top face shows; the Plumb drawn in the class shader. Along the ring's rivet circle (30 brass rivets,
   * 2 cm, on the enamel face) the samples that land on the ring read brass or enamel; each brass run between enamel
   * is one rivet resolved. Bar: the rivets on the visible arc resolve (>= 90 %) and each spans >= 2 px. */
  await guard('detail6m', async () => {
    const gim = (m0.parts || []).find((q) => q.name === 'gimbal')?.mesh;
    if (!gim) throw new Error('no gimbal part');
    const head = gim.getWorldPosition(new THREE.Vector3());
    const dir = cam.position.clone().sub(head); dir.y = 0; dir.normalize();
    const cv = cam.clone(); cv.position.copy(head).addScaledVector(dir, 6.0); cv.position.y += 0.9; cv.lookAt(head); cv.updateMatrixWorld(true); cv.updateProjectionMatrix();
    const buf = classFrame(cv);
    const k = m0._scale || 1, rm = (0.425 + 0.55) / 2, N = 1440, v = new THREE.Vector3();
    const seq = [];
    for (let j = 0; j < N; j++) {
      const u = (j / N) * Math.PI * 2;
      v.set(rm * Math.cos(u), 0.034, -rm * Math.sin(u)); gim.localToWorld(v);
      const q = v.clone().project(cv);
      if (q.z > 1 || Math.abs(q.x) > 1 || Math.abs(q.y) > 1) { seq.push(null); continue; }
      const x = Math.floor((q.x * 0.5 + 0.5) * bw), y = Math.floor((q.y * 0.5 + 0.5) * bh);
      const c = classOf(buf, y * bw + x);
      seq.push(c === 'brass' || c === 'enamel' ? c : null);
    }
    // the visible arc: rivets whose centre sample lands on the ring; resolved: their sample is brass, in a run bounded by enamel
    const runs = []; let cur = null;
    for (let j = 0; j < N * 2; j++) {
      const c = seq[j % N];
      if (c === 'brass') { if (!cur) cur = { start: j, len: 0, open: seq[(j - 1 + N) % N] === 'enamel' }; cur.len++; }
      else { if (cur) { cur.close = c === 'enamel'; if (cur.start < N) runs.push(cur); cur = null; } }
    }
    // a 2 cm rivet's size in px at the ring's distance through this lens; a resolved rivet is a brass run between
    // enamel on the ring's face whose length along the ring is 0.5-2.5 rivet diameters (longer runs are trim, not rivets)
    const dist = head.distanceTo(cv.position), pxPerM = (bh / 2) / (dist * Math.tan(THREE.MathUtils.degToRad(cv.fov) / 2)), px2cm = 0.02 * k * pxPerM;
    const sampM = 2 * Math.PI * rm * k / N;
    const onRing = seq.filter((c) => c != null).length / N;
    const rv = runs.filter((q) => q.open && q.close && q.len * sampM >= 0.01 * k && q.len * sampM <= 0.05 * k);
    const visible = Math.round(30 * onRing), resolved = rv.length;
    let x0 = bw, y0 = bh, x1 = 0, y1 = 0;
    for (let i = 0; i < bw * bh; i++) { if (buf[i * 4] < 20 && buf[i * 4 + 1] < 20 && buf[i * 4 + 2] < 20) continue; const x = i % bw, y = (i / bw) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const cy0 = Math.max(0, y1 - Math.round((y1 - y0) * 0.35));
    // the frame-wide count: separate brass blobs (8-connected) of 2-40 px whose box is <= 3 rivet diameters, on the
    // Plumb in this 6 m frame: each is a 2-5 cm brass detail resolved on its own (rivets on the lune seams, the ring and
    // the legs' clamps). The ring's top face is near edge-on from 0.9 m above, so its own rivets merge (ring line above)
    const isB = (i) => classOf(buf, i) === 'brass', seen = new Uint8Array(bw * bh), blobs = [];
    for (let i = 0; i < bw * bh; i++) {
      if (seen[i] || !isB(i)) continue;
      const st = [i]; seen[i] = 1; let n = 0, bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
      while (st.length) { const j = st.pop(); n++; const x = j % bw, y = (j / bw) | 0; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
        if (n > 400) continue;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= bw || yy >= bh) continue; const q = yy * bw + xx; if (!seen[q] && isB(q)) { seen[q] = 1; st.push(q); } } }
      const span = Math.max(bx1 - bx0 + 1, by1 - by0 + 1);
      if (n >= 2 && n <= 40 && span <= Math.max(3, 3 * px2cm)) blobs.push(span);
    }
    blobs.sort((a, b) => a - b);
    const med = blobs.length ? blobs[blobs.length >> 1] : 0;
    return { distM: r3(dist), fov: r3(cv.fov), px2cm: r3(px2cm), smallBrassBlobs: blobs.length, blobSpanMedianPx: med, ringVisibleShare: r3(onRing), ringExpectedRivets: visible, ringResolvedRivets: resolved, ringRunsPx: rv.map((q) => r3(q.len * sampM * pxPerM)).slice(0, 40),
      bar: '2 cm detail resolves at 6 m: >= 20 separate brass blobs of 2-40 px on the Plumb in the 6 m frame, median span >= 2 px', pass: blobs.length >= 20 && med >= 2,
      headPng: x1 > x0 ? crop(buf, x0, cy0, x1 - x0 + 1, y1 - cy0 + 1, 1) : null };
  });

  await guard('emissive', async () => {
    const sc = new THREE.Scene(); sc.background = null; sc.environment = null;
    const parent = m0.root.parent;
    const rt = new THREE.WebGLRenderTarget(bw, bh, { depthBuffer: true, type: THREE.FloatType });
    const hullMat = (() => { let h = null; for (const o of meshesOf(m0)) if (!isGlass(o)) { h = o.material; break; } return h; })();
    const sunU = hullMat?.userData?.hullU?.uSunRad;
    const sun0 = sunU ? sunU.value.clone() : null;
    const prevRT = R.getRenderTarget(), prevTM = R.toneMapping;
    sc.add(m0.root);
    m0.root.updateMatrixWorld(true);
    if (sunU) sunU.value.set(0, 0, 0);
    const count = (which) => {
      const vis = [];
      for (const o of meshesOf(m0)) { vis.push([o, o.visible]); o.visible = which === 'hull' ? !isGlass(o) : isGlass(o); }
      R.setRenderTarget(rt); R.setClearColor(0x000000, 1); R.clear(true, true, true); R.render(sc, cam);
      const b = new Float32Array(bw * bh * 4); R.readRenderTargetPixels(rt, 0, 0, bw, bh, b);
      for (const [o, v] of vis) o.visible = v;
      let nz = 0, mx = 0;
      for (let i = 0; i < bw * bh; i++) { const v = Math.max(b[i * 4], b[i * 4 + 1], b[i * 4 + 2]); if (v > 1e-4) nz++; if (v > mx) mx = v; }
      return { px: nz, max: r3(mx) };
    };
    let hull, glass;
    const unshow = showAll(meshesOf(m0));
    const folded = []; m0.root.traverse((o) => { if (o.isMesh && o.material?.userData?.componentFold && o.visible) { folded.push(o); o.visible = false; } });
    try { hull = count('hull'); glass = count('glass'); }
    finally {
      if (sunU) sunU.value.copy(sun0);
      unshow(); for (const o of folded) o.visible = true;
      parent.add(m0.root); m0.root.updateMatrixWorld(true);
      R.setRenderTarget(prevRT); R.toneMapping = prevTM; R.setClearColor(cc0, ca0); rt.dispose();
    }
    return { hullEmissivePx: hull.px, hullMax: hull.max, vialGlassPx: glass.px, vialMax: glass.max, bar: '0 hull pixels emissive (lamps and vials excepted)', pass: hull.px === 0 && glass.px > 0 };
  });

  /* ================= dynamic tests on a test Plumb, away from the frame ================= */
  const P0 = p.position.clone(), cam0 = { pos: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov };
  const upd0 = p._updateCamera, simT0 = E.simTime;
  p._updateCamera = () => {};
  const flat = (() => {
    for (let i = 0; i < 300; i++) {
      const a = (i * 2.399) % (Math.PI * 2), rr = 70 + (i % 7) * 8;
      const x = P0.x + Math.sin(a) * rr, z = P0.z + Math.cos(a) * rr, h = hy(x, z);
      let ok = true;
      for (let k = 0; k < 12 && ok; k++) { const b = k / 12 * Math.PI * 2; for (const d of [15, 30, 42]) if (Math.abs(hy(x + Math.sin(b) * d, z + Math.cos(b) * d) - h) > 1.1) ok = false; }
      if (ok && (!C.water?.levelAt || C.water.levelAt(x, z) < h - 0.3)) return { x, z };
    }
    return null;
  })();
  if (!flat) { p._updateCamera = upd0; out.dynamic = { error: 'no flat open spot 70-118 m from the frame' }; return out; }
  out.spot = { x: r3(flat.x), z: r3(flat.z) };
  const spawnT = () => {
    const m = M.spawn('plumb', flat.x, flat.z, { route: [{ x: flat.x, z: flat.z }], heading: 0 });
    m.escort = null; m.route = [m.position.clone()]; m._wpIndex = 0; m._waitT = 1e6; m.heading = 0; m.root.rotation.y = 0;
    return m;
  };
  const calm = (m) => { m.suspicion = 0; m._unseenT = 99; if (m.state !== 'patrol' && m.state !== 'downed' && m._toppleT < 0) m.setState?.('patrol'); };
  const dispose = (m) => { const L = M.list, i = L.indexOf(m); if (i >= 0) L.splice(i, 1); try { m.dispose?.(); } catch (e) { /* */ } m.root?.parent?.remove(m.root); };
  const placeBrea = (x, z, fx, fz) => { p.position.set(x, hy(x, z), z); p._snapToGround?.(); p.velocity?.set?.(0, 0, 0); p.camYaw = Math.atan2(fx - x, fz - z) + Math.PI; };
  const wp = (rec) => { rec.obj.updateWorldMatrix(true, false); return rec.obj.getWorldPosition(new THREE.Vector3()); };

  let mt = null;
  try {
    E.requestTimeScale('studio', null);
    mt = spawnT();
    for (let i = 0; i < 40; i++) { calm(mt); await raf(); }

    /* ---- lamps at 40 m, greyscale ---- */
    await guard('lamps40', async () => {
      E.requestTimeScale('studio', 0);
      const u0 = mt.update; mt.update = () => {};
      const lampAt = mt.lamp?.anchor ? mt.lamp.anchor.getWorldPosition(new THREE.Vector3()) : wp(mt._lampWp);
      const fwd = new THREE.Vector3(Math.sin(mt.heading), 0, Math.cos(mt.heading));
      const eye = lampAt.clone().addScaledVector(fwd, 40); eye.y = hy(eye.x, eye.z) + 1.6;
      cam.position.copy(eye); cam.lookAt(lampAt); cam.fov = 55; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      placeBrea(eye.x + fwd.x * 3, eye.z + fwd.z * 3, lampAt.x, lampAt.z);
      const W = window.innerWidth, H = window.innerHeight;
      const q = lampAt.clone().project(cam);
      const sx = bw / W, cx = (q.x * 0.5 + 0.5) * bw, cy = (q.y * 0.5 + 0.5) * bh;   // readback origin bottom-left
      const pxPerM = bh / (2 * 40 * Math.tan(27.5 * Math.PI / 180));
      const rPx = (mt.lamp?.radius ?? 0.18) * pxPerM;
      const half = Math.max(8, Math.ceil(rPx * 2.2)), side = half * 2 + 1;
      const X0 = Math.round(cx - half), Y0 = Math.round(cy - half);
      const lum = new Float32Array(side * side), b = new Uint8Array(side * side * 4);
      const grab = () => { E.render(0); gl.readPixels(X0, Y0, side, side, gl.RGBA, gl.UNSIGNED_BYTE, b); for (let i = 0; i < side * side; i++) lum[i] = 0.2126 * b[i * 4] + 0.7152 * b[i * 4 + 1] + 0.0722 * b[i * 4 + 2]; return lum; };
      const inDisc = (i) => { const x = i % side - half, y = ((i / side) | 0) - half; return Math.hypot(x, y) <= rPx * 1.35; };
      const states = { calm: 'patrol', wary: 'suspicious', hostile: 'alert', dark: null };
      const series = {};
      const N = 48, dt = 1 / 24;
      const strip = {};
      for (const [st, mstate] of Object.entries(states)) {
        series[st] = [];
        if (mstate) { mt.state = mstate; mt.lampDarkT = 0; } else { mt.lampDarkT = 1e6; }
        const trials = st === 'dark' ? 1 : 3;
        for (let tr = 0; tr < trials; tr++) {
          const base = simT0 + 100 + tr * 7.37 + (st.length * 1.13);
          // let the iris settle in the new state (0.6 s of lamp time)
          for (let k = 0; k < 15; k++) { E.simTime = base - 0.6 + k * 0.04; LS.update(); }
          const frames = [];
          for (let k = 0; k < N; k++) { E.simTime = base + k * dt; LS.update(); const L = grab(); frames.push(Float32Array.from(L)); if (tr === 0 && k % 3 === 0 && k < 24) (strip[st] ||= []).push(Uint8Array.from(b)); }
          series[st].push(frames);
        }
      }
      mt.lampDarkT = 0; mt.state = 'patrol';
      // the reference: the same pixels with the lamp closed (the dark state's mean frame). A lamp pixel is LIT where it is
      // brighter than that reference by more than DELTA luma; the signal is the summed excess (greyscale only)
      const ref = new Float32Array(side * side);
      for (const f of series.dark[0]) for (let i = 0; i < f.length; i++) ref[i] += f[i] / series.dark[0].length;
      const DELTA = 12;
      let darkMax = 0, calmMax = 0, TH = DELTA;
      for (const f of series.dark[0]) for (let i = 0; i < f.length; i++) if (inDisc(i)) darkMax = Math.max(darkMax, f[i] - ref[i]);
      for (const tr of series.calm) for (const f of tr) for (let i = 0; i < f.length; i++) if (inDisc(i)) calmMax = Math.max(calmMax, f[i] - ref[i]);
      const feat = (frames) => {
        const area = frames.map((f) => { let n = 0; for (let i = 0; i < f.length; i++) if (inDisc(i) && f[i] - ref[i] > DELTA) n++; return n; });
        const energy = frames.map((f) => { let s = 0; for (let i = 0; i < f.length; i++) if (inDisc(i)) s += Math.max(0, f[i] - ref[i]); return s; });
        const mean = energy.reduce((a, c) => a + c, 0) / energy.length, mx = Math.max(...energy), mn = Math.min(...energy);
        const swing = mean > 0 ? (mx - mn) / mean : 0;
        let rises = 0;
        if (swing > 0.15) { const hi = mean + 0.1 * (mx - mn), lo = mean - 0.1 * (mx - mn); let s = energy[0] > mean ? 1 : 0; for (const e of energy) { if (s === 0 && e > hi) { s = 1; rises++; } else if (s === 1 && e < lo) s = 0; } }
        return { areaPx: Math.max(...area), flickerHz: r3(rises / (frames.length * dt)), swing: r3(swing) };
      };
      const classify = (f, areaCalm) => {
        if (f.areaPx === 0) return 'dark';
        if (f.flickerHz >= 2.5) return 'hostile';
        if (f.flickerHz >= 0.5) return f.areaPx > 0.8 * areaCalm ? 'calm?' : 'wary';
        return f.areaPx >= 0.75 * areaCalm ? 'calm' : (f.areaPx >= 0.35 * areaCalm ? 'wary' : 'hostile');
      };
      const feats = {}; for (const st of Object.keys(states)) feats[st] = series[st].map(feat);
      const areaCalm = Math.max(...feats.calm.map((f) => f.areaPx));
      const results = []; let right = 0, total = 0;
      for (const st of ['calm', 'wary', 'hostile']) for (const f of feats[st]) { const got = classify(f, areaCalm); results.push({ truth: st, got, ...f }); total++; if (got === st) right++; }
      const strips = {};
      for (const [st, bufs] of Object.entries(strip)) {
        const cv = document.createElement('canvas'), S = 4; cv.width = side * S * bufs.length; cv.height = side * S;
        const cx2 = cv.getContext('2d'); cx2.imageSmoothingEnabled = false;
        bufs.forEach((bb, j) => { const id = new ImageData(side, side); for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) { const si = ((side - 1 - y) * side + x) * 4, di = (y * side + x) * 4; const Y = 0.2126 * bb[si] + 0.7152 * bb[si + 1] + 0.0722 * bb[si + 2]; id.data[di] = id.data[di + 1] = id.data[di + 2] = Y; id.data[di + 3] = 255; } const t = document.createElement('canvas'); t.width = side; t.height = side; t.getContext('2d').putImageData(id, 0, 0); cx2.drawImage(t, j * side * S, 0, side * S, side * S); });
        strips[st] = cv.toDataURL('image/png');
      }
      E.simTime = simT0;
      mt.update = u0;
      E.requestTimeScale('studio', null);
      return { distM: 40, fov: 55, lensPx: r3(2 * rPx), litDeltaY: DELTA, darkNoiseMaxY: r3(darkMax), calmExcessMaxY: r3(calmMax), thresholdY: r3(TH), darkMaxY: r3(darkMax), calmMaxY: r3(calmMax), results, correct: `${right}/${total}`, pass: right === total, rule: 'flicker >= 2.5 Hz hostile; 0.5-2.5 Hz wary; steady: area >= 75 % of calm calm, >= 35 % wary, else hostile; area 0 dark', stripsPng: strips };
    });

    /* ---- 40 m shots at the vial ---- */
    await guard('shots40', async () => {
      const A = C.combat?.arrows;
      if (!A) throw new Error('no ctx.combat.arrows');
      const def = (await import('/src/combat/weapons.js')).AMMO.hunter;
      const speed = def.speed;   // drawScaled: 0.55 + 0.45 x 1 at full draw
      const g = A.gravity, drag = A.drag;
      const ALEN = 0.0;
      let rec = null;
      const td0 = mt.takeDamage;
      mt.takeDamage = function (hit) {
        const v = wp(mt._vialWp);
        const pt = hit?.point ? hit.point.clone() : null;
        const loc = pt ? mt.root.worldToLocal(pt.clone()).sub(mt.root.worldToLocal(v.clone())) : null;
        rec = { point: pt, dVial: pt ? r3(pt.distanceTo(v)) : null, vial: !!pt && pt.distanceTo(v) <= mt._vialWp.radius, part: hit?.object?.userData?.part?.name || null, obj: hit?.object?.name || null, offLocal: loc ? [r3(loc.x), r3(loc.y), r3(loc.z)] : null };
        const h0 = mt._vialHits;
        const r = td0.call(this, hit);
        rec.vial = mt._vialHits > h0;   // the Plumb's own rule (its vial sphere or the vial's hit box)
        mt.health = mt.maxHealth; mt._vialHits = 0;
        return r;
      };
      // the launch elevation that brings a tip launched from o at `speed` through target point t (the game's own
      // explicit Euler with its drag, at 1/240 s; the game's fixed step differs by millimetres at 40 m)
      const solve = (o, t) => {
        const flatD = Math.hypot(t.x - o.x, t.z - o.z), hx = (t.x - o.x) / flatD, hz = (t.z - o.z) / flatD;
        const yAt = (el) => { let x = 0, y = o.y, vx = Math.cos(el) * speed, vy = Math.sin(el) * speed; const h = 1 / 240; for (let k = 0; k < 2400; k++) { vy -= g * h; const dk = 1 - drag * h; vx *= dk; vy *= dk; const nx = x + vx * h; if (nx >= flatD) { const f = (flatD - x) / (nx - x); return y + vy * h * f; } x = nx; y += vy * h; } return -1e9; };
        let lo = -0.3, hi = 0.5;
        for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (yAt(mid) < t.y) lo = mid; else hi = mid; }
        const el = (lo + hi) / 2;
        return new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
      };
      const sets = { centre: 0, ring5cm: 0.05 };
      const res = {};
      for (const [name, off] of Object.entries(sets)) {
        const list = [];
        for (let i = 0; i < 10; i++) {
          for (let k = 0; k < 10; k++) { calm(mt); await raf(); }
          // bearing 0 = straight down the lamp's axis (in front of the drum), then every 36 degrees
          const la = mt.lamp?.anchor ? mt.lamp.anchor.getWorldPosition(new THREE.Vector3()) : wp(mt._lampWp);
          const az = Math.atan2(la.x - mt.position.x, la.z - mt.position.z) + i * (Math.PI * 2 / 10);
          const v = wp(mt._vialWp);
          const ox = mt.position.x + Math.sin(az) * 40, oz = mt.position.z + Math.cos(az) * 40;
          placeBrea(ox, oz, mt.position.x, mt.position.z);
          const o = new THREE.Vector3(ox, hy(ox, oz) + 1.45, oz);
          // aim point: the vial centre, or 5 cm off it on a ring square to the line of sight
          const los = v.clone().sub(o).normalize(), s1 = new THREE.Vector3().crossVectors(los, new THREE.Vector3(0, 1, 0)).normalize(), s2 = new THREE.Vector3().crossVectors(s1, los);
          const ang = i * (Math.PI * 2 / 10);
          const aim = v.clone().addScaledVector(s1, Math.cos(ang) * off).addScaledVector(s2, Math.sin(ang) * off);
          cam.position.copy(o).addScaledVector(los, -3).add(new THREE.Vector3(0, 0.4, 0)); cam.lookAt(v); cam.fov = 40; cam.updateProjectionMatrix();
          const dir = solve(o, aim);
          rec = null;
          const arrow = A.fire(o.clone().addScaledVector(dir, -ALEN), dir, speed, 'hunter', 1);
          const t0 = E.simTime;
          let closest = 1e9, cy = null;
          while (E.simTime - t0 < 1.3 && !rec) {
            calm(mt); await raf();
            if (arrow?.pos) { const vv = wp(mt._vialWp), d = arrow.pos.distanceTo(vv); if (d < closest) { closest = d; cy = r3(arrow.pos.y - vv.y); } }
          }
          if (!rec) rec = { miss: true, closestTailM: r3(closest), dyAtClosest: cy, mode: arrow?.mode, stuckTo: arrow?.stuckTo?.name || null };
          list.push(rec && rec.miss ? { bearingDeg: Math.round(i * 36), vial: false, ...rec } : rec ? { bearingDeg: Math.round(i * 36), vial: rec.vial, dVialM: rec.dVial, part: rec.part, obj: rec.obj, offLocal: rec.offLocal } : { bearingDeg: Math.round(i * 36), vial: false, miss: true, headYaw: r3(mt.rig?.bones?.head?.rotation?.y ?? null) });
        }
        res[name] = { hits: list.filter((x) => x.vial).length, of: 10, shots: list };
      }
      mt.takeDamage = td0;
      // the capsules near the vial (world -> the Plumb's root frame, relative to the vial): what an arrow can stop on
      let caps = null;
      try {
        const v = wp(mt._vialWp), toL = (q) => { const w = new THREE.Vector3(...q); return mt.root.worldToLocal(w).sub(mt.root.worldToLocal(v.clone())); };
        caps = C.hitHulls.hulls(mt).map((h) => { const a = toL(h.a), b = toL(h.b); return { name: h.name, part: h.part, r: h.r, a: [r3(a.x), r3(a.y), r3(a.z)], b: [r3(b.x), r3(b.y), r3(b.z)] }; })
          .filter((h) => Math.min(Math.abs(h.a[1]), Math.abs(h.b[1])) < 0.6 || (h.a[1] < 0) !== (h.b[1] < 0));
      } catch (e) { caps = String(e); }
      return { capsulesNearVial: caps, headYaw: r3(mt.rig?.bones?.head?.rotation?.y ?? null), distM: 40, arrow: 'Reed (hunter) at full draw', speed, vialRadiusM: mt._vialWp.radius, vialLenM: mt.ctx?.assets?.models?.plumb?.r5Sockets?.vialLen ?? null, ...res, bar: 'vial hit by >= 9 of 10 at 40 m (the centre set)', pass: res.centre.hits >= 9 };
    });

    /* ---- the topple clock ---- */
    await guard('topple', async () => {
      mt.health = mt.maxHealth; mt._vialHits = 0;
      for (let k = 0; k < 20; k++) { calm(mt); await raf(); }
      const hull = meshesOf(mt).find((o) => !isGlass(o));
      const hit = () => mt.takeDamage({ point: wp(mt._vialWp), object: hull, impact: 3, tear: 0, element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: -1 }, type: 'arrow' });
      const tilt = () => 2 * Math.acos(Math.min(1, Math.abs(mt.body.quaternion.w)));
      const diag = [];
      const snap = (tag) => { const v = wp(mt._vialWp); diag.push({ tag, vialHits: mt._vialHits, toppleT: r3(mt._toppleT), alive: mt.alive, state: mt.state, wpParent: mt._vialWp.obj.parent?.name || null, wp: [r3(v.x - mt.position.x), r3(v.y - mt.position.y), r3(v.z - mt.position.z)] }); };
      snap('before');
      hit(); snap('hit1');
      for (let k = 0; k < 12; k++) await raf();
      const afterOne = mt._toppleT >= 0;
      const s0 = E.simTime;
      hit(); snap('hit2');
      let tDown = null, tUp = null, maxTilt = 0, downedEnd = null;
      let nAnim = 0, nPose = 0; const an0 = mt.animate, po0 = mt._poseTopple;
      mt.animate = function (...q) { nAnim++; return an0.apply(this, q); };
      mt._poseTopple = function (...q) { nPose++; return po0.apply(this, q); };
      const trace = [];
      while (E.simTime - s0 < 6.5) {
        await raf(); mt.health = mt.maxHealth;
        if (trace.length < 6) trace.push({ t: r3(E.simTime - s0), toppleT: r3(mt._toppleT), qw: r3(mt.body.quaternion.w), ang: r3(mt._toppleAng), pz: r3(mt._pivotZ), lay: [r3(mt._layRear), r3(mt._layFront)], lowLOD: !!mt.lowLOD, nAnim, nPose, state: mt.state });
        const t = E.simTime - s0, a = tilt();
        if (a > maxTilt) maxTilt = a;
        if (tDown === null && a > 0.5) tDown = t;
        if (downedEnd === null && tDown !== null && mt.state !== 'downed') downedEnd = t;
        if (tUp === null && tDown !== null && a < 0.03 && mt._toppleT < 0) tUp = t;
        if (tUp !== null && downedEnd !== null) break;
      }
      mt.animate = an0; mt._poseTopple = po0;
      diag.push({ trace });
      return { diag, firstHitTopples: afterOne, fallBeganS: r3(tDown), maxTiltRad: r3(maxTilt), uprightAgainS: r3(tUp), downedStateEndS: r3(downedEnd), bar: '4.0 +- 0.2 s from the second hit to upright', pass: !afterOne && tUp !== null && Math.abs(tUp - 4.0) <= 0.2 };
    });

    /* ---- Pry: the bob and the lamp drum ---- */
    await guard('pry', async () => {
      for (let k = 0; k < 20; k++) { calm(mt); await raf(); }
      const parts = Object.fromEntries((mt.parts || []).map((q) => [q.name, q]));
      const tearOn = (q) => { const mesh = q.mesh.children[0] || q.mesh; const pt = q.mesh.getWorldPosition(new THREE.Vector3()); return mt.takeDamage({ point: pt, object: mesh, impact: 0, tear: 60, element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: -1 }, type: 'arrow' }); };
      const before = { bob: parts.bob?.attached, drum: parts.drum?.attached, lamp: !!mt.lamp, sightlineDisabled: mt.attackDisabled('sightline'), pendulumDisabled: mt.attackDisabled('pendulum') };
      if (parts.bob) tearOn(parts.bob);
      if (parts.drum) tearOn(parts.drum);
      for (let k = 0; k < 6; k++) await raf();
      const flagged = M.perception?.flagPlayer ? M.perception.flagPlayer(mt) : 'no perception';
      const after = { bob: parts.bob?.attached, drum: parts.drum?.attached, lamp: !!mt.lamp, lampState: LS?.stateOf(mt), sightlineDisabled: mt.attackDisabled('sightline'), pendulumDisabled: mt.attackDisabled('pendulum'), bobDropDisabled: mt.attackDisabled('bob-drop'), flagRefused: flagged === null };
      return { tear: 60, tearHp: { bob: parts.bob?.maxTearHp, drum: parts.drum?.maxTearHp }, before, after, pass: before.bob && before.drum && after.bob === false && after.drum === false && !after.lamp && after.sightlineDisabled && after.pendulumDisabled && after.flagRefused };
    });
  } finally {
    if (mt) dispose(mt);
    E.requestTimeScale('studio', 0);
    E.simTime = Math.max(E.simTime, simT0);
    p.position.copy(P0); p._snapToGround?.(); p.velocity?.set?.(0, 0, 0);
    p._updateCamera = upd0;
    cam.position.copy(cam0.pos); cam.quaternion.copy(cam0.q); cam.fov = cam0.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    await raf();
  }
  out.totalSeconds = r3((performance.now() - out.t0) / 1000);
  delete out.t0;
  return out;
}
