/**
 * M1.6l RUNG 2, LIVE: a `film.mjs --probe` page module (it runs after a frame's screenshot, the world frozen). On the first
 * frame of the run only:
 *
 *   silhouette   her figure at 20 m (the game's 50 deg lens, 1080 px tall, from the front, her left three-quarter and her
 *                left side) in the Scout and in the Starter: every visible triangle of her skinned meshes (her body inside
 *                the set's cover, the hidden hat copies and kit pieces left out) projected and filled into a mask. Reported:
 *                each mask's area, the share of the union the two do not share (1 - IoU), the rows that differ, and the
 *                masks themselves (rows of 0/1) for the review.
 *   shrug        a Flag raised on her by the game's own perception hooks and run out on its own clock (1/60 s steps), in
 *                the Scout and in the Starter. Bar: 3 s and 8 s (+- 0.1).
 *   reward       the runtime's own `wear('scout')` (what the reward of Raker's Morning calls) from the Starter: she wears
 *                pan-2 and the perception's flag duration reads 3.
 *
 * She is left wearing the Scout, so the run's other frames film it.
 */
export async function probe(frame) {
  const W = window;
  if (W.__RUNG2_DONE) return { skipped: 'done on an earlier frame' };
  W.__RUNG2_DONE = true;
  const C = W.__CTX__, P = C.player, H = P.hero, L = H?.loadout;
  if (!L?.equipArmor) return { error: 'no loadout' };
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  const settle = async () => { H.update?.(0); for (let i = 0; i < 3; i++) await raf(); };
  const T = P.model.position.constructor;
  const v = new T(), a = new T(), b = new T(), c = new T();

  /* the 20 m mask */
  const HPX = 1080, FOV = 50 * Math.PI / 180;
  const pxPerM = HPX / (2 * 20 * Math.tan(FOV / 2));
  const MW = 90, MH = 130;     // mask size in px (her 1.75 m is ~101 px at 20 m)
  function mask(bearingDeg) {
    P.model.updateMatrixWorld(true);
    const org = P.position.clone();
    const hd = P.heading ?? P.model.rotation.y;
    const ang = hd + bearingDeg * Math.PI / 180;
    const fwd = new T(Math.sin(ang), 0, Math.cos(ang));          // from her toward the lens
    const right = new T(Math.cos(ang), 0, -Math.sin(ang));
    const m = new Uint8Array(MW * MH);
    const put = (p) => { const d = p.clone().sub(org); return [MW / 2 + d.dot(right) * pxPerM, MH - 6 - d.y * pxPerM]; };
    P.model.traverseVisible((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position || o.material?.colorWrite === false) return;
      const g = o.geometry, idx = g.index, n = idx ? idx.count : g.attributes.position.count;
      const dr = g.drawRange, start = dr.start, end = Math.min(n, dr.start + (Number.isFinite(dr.count) ? dr.count : n));
      const piece = g.getAttribute('_piece') || g.getAttribute('_PIECE');
      // (the piece bits the outfit hides now: the loadout's own, since the fade clone of the material carries no uniform)
      const hide = /^outfit:/.test(o.userData?.heroPart || '') ? (L._pieceBits > 0 ? L._pieceBits : 0) : (o.material?.userData?.clothU?.uHidePiece?.value | 0);
      const vis = (i) => !(piece && hide && ((Math.round(piece.getX(i)) & hide) !== 0));
      const pos = (i, t) => { if (o.isSkinnedMesh && o.getVertexPosition) o.getVertexPosition(i, t); else t.fromBufferAttribute(g.attributes.position, i); return t.applyMatrix4(o.matrixWorld); };
      for (let k = start; k + 2 < end; k += 3) {
        const i0 = idx ? idx.getX(k) : k, i1 = idx ? idx.getX(k + 1) : k + 1, i2 = idx ? idx.getX(k + 2) : k + 2;
        if (!vis(i0) || !vis(i1) || !vis(i2)) continue;
        const A = put(pos(i0, a)), B = put(pos(i1, b)), Cc = put(pos(i2, c));
        const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], Cc[0]))), x1 = Math.min(MW - 1, Math.ceil(Math.max(A[0], B[0], Cc[0])));
        const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], Cc[1]))), y1 = Math.min(MH - 1, Math.ceil(Math.max(A[1], B[1], Cc[1])));
        const den = (B[1] - Cc[1]) * (A[0] - Cc[0]) + (Cc[0] - B[0]) * (A[1] - Cc[1]);
        if (Math.abs(den) < 1e-9) continue;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((B[1] - Cc[1]) * (px - Cc[0]) + (Cc[0] - B[0]) * (py - Cc[1])) / den;
          const w1 = ((Cc[1] - A[1]) * (px - Cc[0]) + (A[0] - Cc[0]) * (py - Cc[1])) / den;
          if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) m[y * MW + x] = 1;
        }
      }
    });
    void v;
    return m;
  }
  const rows = (m) => Array.from({ length: MH }, (_, y) => Array.from(m.subarray(y * MW, y * MW + MW)).join(''));
  const area = (m) => m.reduce((s, x) => s + x, 0);
  const VIEWS = [0, 45, 90];

  const shrug = () => {
    const pc = C.machines?.perception;
    if (!pc) return null;
    const f = pc.flagPlayer(null);
    if (!f) return null;
    let n = 0;
    while (f.active && n < 60 * 20) { pc.update(1 / 60); n++; }
    return { lasted: f.active ? null : +(pc.clock - f.t0).toFixed(3), duration: f.duration, hook: pc.flagDuration };
  };

  /*
   * fix round 1: THE HAT OVER THE WRAP, in play (F10 at 7b3ba6f: the knot came up through the brim behind her head, while
   * the recipe's bind fit left 4.2 cm under the brim). Every vertex of her head wrap as the game poses it, against the
   * hat copy on her head (piece bit 32: crown, band and underside): a ray from the vertex down the hat's own axis that
   * meets the hat means the hat lies UNDER that vertex, i.e. the wrap shows through it. Reported: how many, how far
   * through (m), where (bearing in the hat's frame, 0 = her front, 180 = behind), and how many of them ride a dyn_ bone.
   */
  function hatClear() {
    P.model.updateMatrixWorld(true);
    const tris = [], hv = [], wrap = [];
    P.model.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      const g = o.geometry, n = g.attributes.position.count;
      const pos = (i) => { const t = new T(); if (o.isSkinnedMesh && o.getVertexPosition) o.getVertexPosition(i, t); else t.fromBufferAttribute(g.attributes.position, i); return t.applyMatrix4(o.matrixWorld); };
      if (/hairwrap/i.test(o.name || '')) {
        const si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight'), bones = o.skeleton?.bones || [];
        for (let i = 0; i < n; i++) {
          let dyn = false;
          if (si && sw) { let best = -1, bi = 0; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > best) { best = w; bi = si.getComponent(i, k); } } dyn = /^dyn_/.test(bones[bi]?.name || ''); }
          wrap.push({ p: pos(i), dyn });
        }
        return;
      }
      const piece = g.getAttribute('_piece') || g.getAttribute('_PIECE');
      if (!piece || !/^outfit:/.test(o.userData?.heroPart || '')) return;
      const idx = g.index, m = idx ? idx.count : n;
      const on = (i) => (Math.round(piece.getX(i)) & 32) !== 0;
      for (let k = 0; k + 2 < m; k += 3) {
        const i0 = idx ? idx.getX(k) : k, i1 = idx ? idx.getX(k + 1) : k + 1, i2 = idx ? idx.getX(k + 2) : k + 2;
        if (!on(i0) || !on(i1) || !on(i2)) continue;
        const A = pos(i0), B = pos(i1), Cc = pos(i2);
        tris.push(A, B, Cc); hv.push(A, B, Cc);
      }
    });
    if (!tris.length || !wrap.length) return { error: `hat tris ${tris.length / 3}, wrap verts ${wrap.length}` };
    // the hat's axis: the least spread of its vertices (the brim is a disc), turned toward the crown's top
    const c = new T(); for (const q of hv) c.add(q); c.multiplyScalar(1 / hv.length);
    const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const q of hv) { const d = [q.x - c.x, q.y - c.y, q.z - c.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i * 3 + j] += d[i] * d[j]; }
    const tr = cov[0] + cov[4] + cov[8];
    let ax = [0, 1, 0];
    for (let it = 0; it < 60; it++) {
      const v = [0, 1, 2].map((i) => tr * ax[i] - (cov[i * 3] * ax[0] + cov[i * 3 + 1] * ax[1] + cov[i * 3 + 2] * ax[2]));
      const L = Math.hypot(...v) || 1; ax = v.map((x) => x / L);
    }
    const A = new T(ax[0], ax[1], ax[2]);
    let far = null, fd = -1; for (const q of hv) { const d = Math.abs(q.clone().sub(c).dot(A)); if (d > fd) { fd = d; far = q; } }
    if (far.clone().sub(c).dot(A) < 0) A.multiplyScalar(-1);
    if (A.y < 0) A.multiplyScalar(-1);   // the crown is above the brim
    const down = A.clone().multiplyScalar(-1);
    const e1 = new T(), e2 = new T(), pv = new T(), tv = new T(), qv = new T();
    const rayHit = (o) => {
      let best = Infinity;
      for (let k = 0; k < tris.length; k += 3) {
        const a = tris[k], b = tris[k + 1], cc = tris[k + 2];
        e1.subVectors(b, a); e2.subVectors(cc, a); pv.crossVectors(down, e2);
        const det = e1.dot(pv); if (Math.abs(det) < 1e-12) continue;
        tv.subVectors(o, a); const u = tv.dot(pv) / det; if (u < 0 || u > 1) continue;
        qv.crossVectors(tv, e1); const v = down.dot(qv) / det; if (v < 0 || u + v > 1) continue;
        const t = e2.dot(qv) / det; if (t > 0 && t < best) best = t;
      }
      return best;
    };
    // her heading in the hat's frame: bearing 0 is her front
    const hd = P.heading ?? P.model.rotation.y, fw = new T(Math.sin(hd), 0, Math.cos(hd));
    const fwP = fw.clone().sub(A.clone().multiplyScalar(fw.dot(A))).normalize(), rtP = new T().crossVectors(A, fwP);
    const thr = [];
    for (const w of wrap) {
      if (w.p.distanceTo(c) > 0.32) continue;
      const t = rayHit(w.p);
      if (t > 0.25) continue;
      const d = w.p.clone().sub(c);
      thr.push({ t, dyn: w.dyn, brg: Math.round(((Math.atan2(d.dot(rtP), d.dot(fwP)) * 180 / Math.PI) + 360) % 360) });
    }
    thr.sort((a, b) => b.t - a.t);
    const hist = {}; for (const x of thr) { const k = Math.round(x.brg / 30) * 30 % 360; hist[k] = (hist[k] || 0) + 1; }
    return { hatTris: tris.length / 3, wrapVerts: wrap.length, through: thr.length, throughDyn: thr.filter((x) => x.dyn).length, maxThroughM: thr.length ? +thr[0].t.toFixed(4) : 0,
      byBearing: hist, worst: thr.slice(0, 5).map((x) => ({ m: +x.t.toFixed(4), brg: x.brg, dyn: x.dyn })), axis: [A.x, A.y, A.z].map((x) => +x.toFixed(3)) };
  }

  const out = { frame: frame?.id, pxPerM: +pxPerM.toFixed(2), maskW: MW, maskH: MH };
  // the Scout (as the run wears it), then the Starter, then the reward's own path back to the Scout
  if (L.armorId !== 'pan-2') { await L.equipArmor('pan-2'); }
  await settle();
  out.scout = { armor: L.armorId, info: H.outfit?.info?.(), masks: {}, shrug: shrug() };
  try { out.scout.hatClear = hatClear(); } catch (e) { out.scout.hatClear = { error: String(e?.message || e).slice(0, 200) }; }
  const ms = {};
  for (const d of VIEWS) { ms[d] = mask(d); out.scout.masks[d] = rows(ms[d]); }
  await L.equipArmor('pan-1'); await settle();
  out.starter = { armor: L.armorId, info: H.outfit?.info?.(), masks: {}, shrug: shrug() };
  out.compare = {};
  for (const d of VIEWS) {
    const m1 = mask(d); out.starter.masks[d] = rows(m1);
    const m2 = ms[d];
    let inter = 0, uni = 0, rowsDiff = 0;
    for (let y = 0; y < MH; y++) {
      let rd = 0;
      for (let x = 0; x < MW; x++) { const p = m1[y * MW + x], q = m2[y * MW + x]; if (p && q) inter++; if (p || q) uni++; if (p !== q) rd++; }
      if (rd >= 2) rowsDiff++;
    }
    out.compare[d] = { areaScout: area(m2), areaStarter: area(m1), iou: +(inter / (uni || 1)).toFixed(4), notShared: +(1 - inter / (uni || 1)).toFixed(4), rowsDiffering: rowsDiff };
  }
  const prevRung = C.systemsGame?.rung;
  if (C.systemsGame?.wear) {
    if (C.systemsGame) C.systemsGame.rung = 'scout';
    await C.systemsGame.wear('scout');
    await settle();
    out.reward = { armor: L.armorId, perk: L.perk, flagDuration: C.machines?.perception?.flagDuration ?? null };
    if (C.systemsGame) C.systemsGame.rung = prevRung === 'starter' ? 'scout' : prevRung;
  } else {
    await L.equipArmor('pan-2'); await settle();
    out.reward = { error: 'no systemsGame.wear' };
  }
  out.final = { armor: L.armorId, info: H.outfit?.info?.(), draws: H.info?.()?.draws ?? null, casters: H.info?.()?.casters ?? null, tris: H.info?.()?.tris ?? null };
  return out;
}
