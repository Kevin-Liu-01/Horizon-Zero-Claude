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

  const out = { frame: frame?.id, pxPerM: +pxPerM.toFixed(2), maskW: MW, maskH: MH };
  // the Scout (as the run wears it), then the Starter, then the reward's own path back to the Scout
  if (L.armorId !== 'pan-2') { await L.equipArmor('pan-2'); }
  await settle();
  out.scout = { armor: L.armorId, info: H.outfit?.info?.(), masks: {}, shrug: shrug() };
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
