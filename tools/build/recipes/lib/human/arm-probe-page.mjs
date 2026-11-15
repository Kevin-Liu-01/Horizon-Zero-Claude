/**
 * M1a round 3 (hero-art / armory) ARM PROBE, the page half: run by tools/frames/film.mjs --probe after a frame is staged
 * and filmed (the world frozen), so every number describes the filmed frame.
 *
 *   node tools/frames/film.mjs --port <lane port> --only F08,F09,F17,F24 --no-review --label <tag> \
 *     --probe /tools/build/recipes/lib/human/arm-probe-page.mjs
 *
 * probe(frame) -> {
 *   elbows:  { l, r: { px: [x, y] (CSS px), dist (m from the lens) } }
 *   blob:    (every frame) what is drawn round the elbow nearer the lens: a grid of rays (every 6 px, 120 px square) against
 *            Brea's meshes, counted by mesh; for the rays that hit her skin, the skinned vertex normal (as three's skinning
 *            shader forms it) against the triangle's own normal: the angle between them, N.L and N.V for each, and the
 *            bones that weigh on the hit triangles
 *   looks:   the mean 8-bit colour in a 24 px box on that elbow with her skin terms switched off one at a time (the same frozen
 *            frame, re-rendered), and a 140 px crop of each (`crops`, base64 RGBA, bottom-up rows) for the eye
 *   bracer:  (F08, F09) the left forearm: per (along, around) bin the stow kit's bracer radius and the outfit's largest
 *            radius off the lowerarm_l -> hand_l axis, both skinned as drawn; the bins where the outfit stands over the bracer
 * }
 * Reads only: window.__CTX__ and the app's own modules. Changes nothing it does not restore before it returns.
 */
export async function probe(frame) {
  const C = window.__CTX__, E = C.engine, cam = C.camera, R = E.renderer, p = C.player, model = p.model;
  const THREE = await import('/tools/look/three.mjs');
  const { skinLookUniforms } = await import('/src/hero/skinLook.js');
  const out = { frame: frame.id };
  const W = window.innerWidth, H = window.innerHeight;
  model.updateMatrixWorld(true);
  const meshes = [];
  model.traverse((o) => { if (o.isSkinnedMesh && o.visible) meshes.push(o); });
  const tag = (m) => (m.geometry.getAttribute('_hidemask') ? 'skin' : m.name === 'Caster' ? 'caster' : (m.userData?.heroPart || m.name || 'mesh'));
  const skin = meshes.find((m) => m.geometry.getAttribute('_hidemask'));
  const toPx = (v) => { const q = v.clone().project(cam); return [(q.x * 0.5 + 0.5) * W, (0.5 - q.y * 0.5) * H]; };
  const bone = (n) => model.getObjectByName(n);
  const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;

  /* ---- the elbows on screen ---- */
  const el = {};
  for (const s of ['l', 'r']) {
    const b = bone(`lowerarm_${s}`);
    if (!b) continue;
    const w = b.getWorldPosition(new THREE.Vector3());
    el[s] = { px: toPx(w).map(r1), dist: r3(w.distanceTo(cam.position)), w };
  }
  out.elbows = Object.fromEntries(Object.entries(el).map(([k, v]) => [k, { px: v.px, dist: v.dist }]));
  const near = el.l && el.r ? (el.l.dist < el.r.dist ? 'l' : 'r') : (el.l ? 'l' : 'r');
  out.near = near;

  /* ---- what is drawn round the near elbow ---- */
  try {
    for (const m of meshes) m.computeBoundingSphere?.();
    const rc = new THREE.Raycaster();
    const [cx, cy] = el[near].px;
    const counts = {}, hits = [];
    const sunDir = C.environment?.sunDir?.clone().normalize() || new THREE.Vector3(0, 1, 0);
    const bm = new THREE.Matrix4(), sm = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
    const pos = skin?.geometry.getAttribute('position'), nrm = skin?.geometry.getAttribute('normal');
    const si = skin?.geometry.getAttribute('skinIndex'), sw = skin?.geometry.getAttribute('skinWeight');
    const bones = skin?.skeleton.bones;
    skin?.skeleton.update();
    const bmat = skin?.skeleton.boneMatrices;
    /** the skinned object-space normal of vertex i, as skinnormal_vertex forms it, and the length of the blend before normalising */
    const skNormal = (i) => {
      sm.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k);
        if (!w) continue;
        bm.fromArray(bmat, si.getComponent(i, k) * 16);
        for (let e = 0; e < 16; e++) sm.elements[e] += bm.elements[e] * w;
      }
      const M = new THREE.Matrix4().copy(skin.bindMatrixInverse).multiply(sm).multiply(skin.bindMatrix);
      nm.setFromMatrix4(M);
      v.fromBufferAttribute(nrm, i).applyMatrix3(nm);
      const len = v.length();
      return { n: v.normalize().applyMatrix3(new THREE.Matrix3().getNormalMatrix(skin.matrixWorld)).normalize(), len };
    };
    for (let dy = -60; dy <= 60; dy += 6) for (let dx = -60; dx <= 60; dx += 6) {
      const x = cx + dx, y = cy + dy;
      rc.setFromCamera(new THREE.Vector2(x / W * 2 - 1, 1 - y / H * 2), cam);
      const hit = rc.intersectObjects(meshes, false)[0];
      const k = hit ? tag(hit.object) : 'none';
      counts[k] = (counts[k] || 0) + 1;
      if (hit && hit.object === skin && hit.face) {
        const ids = [hit.face.a, hit.face.b, hit.face.c];
        const P = ids.map((i) => skin.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(skin.matrixWorld));
        const geo = new THREE.Vector3().subVectors(P[1], P[0]).cross(new THREE.Vector3().subVectors(P[2], P[0])).normalize();
        const bc = hit.barycoord || new THREE.Vector3(1 / 3, 1 / 3, 1 / 3);
        const sk = ids.map(skNormal);
        const ni = new THREE.Vector3().addScaledVector(sk[0].n, bc.x).addScaledVector(sk[1].n, bc.y).addScaledVector(sk[2].n, bc.z).normalize();
        const view = cam.position.clone().sub(hit.point).normalize();
        const wts = {};
        for (const i of ids) for (let q = 0; q < 4; q++) { const w = sw.getComponent(i, q); if (w > 0.02) { const nmB = bones[si.getComponent(i, q)]?.name; wts[nmB] = r3((wts[nmB] || 0) + w / 3); } }
        hits.push({
          dx, dy, angle: r1(THREE.MathUtils.radToDeg(Math.acos(Math.max(-1, Math.min(1, ni.dot(geo)))))),
          nlInterp: r3(ni.dot(sunDir)), nlGeo: r3(geo.dot(sunDir)), nvInterp: r3(ni.dot(view)), nvGeo: r3(geo.dot(view)),
          blendLen: r3(Math.min(...sk.map((s) => s.len))), uv: hit.uv ? [r3(hit.uv.x), r3(hit.uv.y)] : null, bones: wts,
        });
      }
    }
    const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : null; };
    out.blob = {
      centre: [r1(cx), r1(cy)], counts, skinHits: hits.length,
      angleMedian: med(hits.map((h) => h.angle)), angleOver45: hits.filter((h) => h.angle > 45).length,
      nlInterpMedian: med(hits.map((h) => h.nlInterp)), nlGeoMedian: med(hits.map((h) => h.nlGeo)),
      nvGeoBackfacing: hits.filter((h) => h.nvGeo < 0).length,
      blendLenMin: hits.length ? Math.min(...hits.map((h) => h.blendLen)) : null,
      sunDir: [r3(sunDir.x), r3(sunDir.y), r3(sunDir.z)],
      samples: hits.filter((h) => Math.abs(h.dx) <= 24 && Math.abs(h.dy) <= 24),
    };
  } catch (e) { out.blob = { error: String(e?.stack || e).slice(0, 400) }; }

  /* ---- the elbow re-rendered with each of her skin terms off ---- */
  try {
    const gl = R.getContext(), bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight, sx = bw / W, sy = bh / H;
    const [cx, cy] = el[near].px;
    const box = (half) => { const x0 = Math.max(0, Math.round((cx - half) * sx)), y0 = Math.max(0, Math.round(bh - (cy + half) * sy)); return [x0, y0, Math.min(bw - x0, Math.round(2 * half * sx)), Math.min(bh - y0, Math.round(2 * half * sy))]; };
    const read = (half) => { const [x0, y0, w, h] = box(half); const b = new Uint8Array(w * h * 4); gl.readPixels(x0, y0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b); return { b, w, h }; };
    const mean = ({ b }) => { let r = 0, g = 0, bb = 0, n = 0; for (let i = 0; i < b.length; i += 4) { r += b[i]; g += b[i + 1]; bb += b[i + 2]; n++; } return [r / n, g / n, bb / n].map(Math.round); };
    const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
    const U = skinLookUniforms(skin?.material);
    const mat = skin?.material;
    const variants = [
      ['base', null, null],
      ['emissive 0', () => { const k = mat.emissiveIntensity; mat.emissiveIntensity = 0; return () => { mat.emissiveIntensity = k; }; }],
      ['calSkinK 0 (stock lambert, no rim)', () => { const k = U.calSkinK.value; U.calSkinK.value = 0; return () => { U.calSkinK.value = k; }; }],
      ['calPreK 0 (wrap, no pre-integration)', () => { const k = U.calPreK.value; U.calPreK.value = 0; return () => { U.calPreK.value = k; }; }],
      ['calLobeK 0', () => { if (!U.calLobeK) return () => {}; const k = U.calLobeK.value; U.calLobeK.value = 0; return () => { U.calLobeK.value = k; }; }],
      ['roughness 1, metal 0, specular off', () => { const r = mat.roughness, sp = mat.specularIntensity; mat.roughness = 1; if (sp !== undefined) mat.specularIntensity = 0; return () => { mat.roughness = r; if (sp !== undefined) mat.specularIntensity = sp; }; }],
      ['skin hidden', () => { skin.visible = false; return () => { skin.visible = true; }; }],
    ];
    for (const m of meshes) if (m !== skin && tag(m) !== 'caster') variants.push([`${tag(m)} hidden`, () => { const v0 = m.visible; m.visible = false; return () => { m.visible = v0; }; }]);
    out.looks = [];
    out.crops = [];
    for (const [name, set] of variants) {
      let undo = null;
      try {
        if (set) undo = set();
        E.render(0);
        const small = read(12), big = read(70);
        out.looks.push({ name, mean: mean(small) });
        out.crops.push({ name, w: big.w, h: big.h, b64: b64(big.b) });
      } catch (e) { out.looks.push({ name, error: String(e?.message || e).slice(0, 200) }); }
      finally { if (undo) undo(); }
    }
    E.render(0);
  } catch (e) { out.looks = { error: String(e?.stack || e).slice(0, 400) }; }

  /* ---- the left bracer against the outfit, as drawn ---- */
  if (/F0[89]|F10/.test(frame.id)) {
    try {
      const kit = meshes.find((m) => /stowkit/.test(m.userData?.heroPart || '')), fit = meshes.find((m) => /outfit/.test(m.userData?.heroPart || '') && m.name !== 'Caster');
      const a = bone('lowerarm_l').getWorldPosition(new THREE.Vector3()), b = bone('hand_l').getWorldPosition(new THREE.Vector3());
      const X = b.clone().sub(a), L = X.length(); X.normalize();
      const up = Math.abs(X.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const Z = new THREE.Vector3().crossVectors(X, up).normalize(), Y = new THREE.Vector3().crossVectors(Z, X);
      const bin = (m, filter) => {
        const mp = new Map(), q = new THREE.Vector3(), P = m.geometry.getAttribute('position');
        for (let i = 0; i < P.count; i++) {
          if (filter && !filter(i)) continue;
          m.getVertexPosition(i, q); q.applyMatrix4(m.matrixWorld);
          const rel = q.sub(a), t = rel.dot(X) / L;
          if (t < 0 || t > 1.05) continue;
          const y = rel.dot(Y), z = rel.dot(Z), r = Math.hypot(y, z);
          if (r > 0.09) continue;
          const k = `${Math.floor(t * 10)}|${Math.round(Math.atan2(y, z) / (Math.PI / 6))}`;
          const e = mp.get(k) || { min: 9, max: 0 };
          e.min = Math.min(e.min, r); e.max = Math.max(e.max, r); mp.set(k, e);
        }
        return mp;
      };
      const PC = kit?.geometry.getAttribute('_piece');
      const kb = kit && PC ? bin(kit, (i) => (Math.round(PC.getX(i)) & 8) !== 0) : new Map();
      const ob = fit ? bin(fit) : new Map();
      const rows = [];
      for (const [k, e] of kb) { const o = ob.get(k); rows.push({ bin: k, bracer: [r3(e.min * 1000), r3(e.max * 1000)], outfitMax: o ? r3(o.max * 1000) : null, over: o ? r3((o.max - e.max) * 1000) : null }); }
      rows.sort((p1, p2) => (p2.over ?? -99) - (p1.over ?? -99));
      out.bracer = { lowerarmLen: r3(L), bins: rows.length, outfitOverBracer: rows.filter((r) => r.over != null && r.over > 0).length, worst: rows.slice(0, 12), kitHidden: p.hero?.kit?.hidden ?? null };
    } catch (e) { out.bracer = { error: String(e?.stack || e).slice(0, 400) }; }
  }
  return out;
}
