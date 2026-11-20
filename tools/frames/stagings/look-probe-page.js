/**
 * THE POLISH LANE'S FRAME READS (frames + far forms), the page half: `film.mjs --probe /tools/frames/stagings/look-probe-page.js`.
 * Runs after each frame's shot with the world frozen; every change is undone. (A .js file: stagings/index.mjs merges
 * the .mjs lane files only.) The F45 frames run area F's calima-noon probe first and carry its result as `calima`.
 *
 * Each read is the frame drawn twice with a thing shown and twice with it hidden (the post chain's history settles in
 * two draws), so its pixels are the ones that change, and "behind" is what those pixels show without it.
 *
 *   F44          the re-survey: Sighting on, the alidade overlay's weight and its diagnostics (tube to the eye, the
 *                elbow), the Windwall's phase and where it was planted, the Windwall's pixels and each looker's
 *                pixels and screen box, and whether the planted Windwall lies on the line from her to a looker
 *   F45, F45-*   the sun's disc: where it projects, whether it is inside the frame, its luminance against a 5-8 deg
 *                ring; the Kiln Yards' pixels against what they hide and against the ground just under them; the
 *                Transit's far form (when shown): its legs' pixels against what they hide and against the dust
 *                around them (a 4-10 px ring outside its mask), and its head's
 *   F42          the Sickle's pixels against the meadow they hide: luminance, chroma and hue, and its share of the
 *                screen box of its hull (what the grass hides of it)
 *   F39-people   each of the five sheltering people: inside the frustum, pixels drawn, screen point
 *   F39-look     (polish 3) the same, with each person's height on screen (its mask's box), and the fight's: the Screed's,
 *                each Sickle's and Brea's pixels and box heights
 *                (F39-look restaged in wall-1's lee: also where the staging put each of the five, `staging`, and every
 *                height again on the mask's core box, `coreH`: the mask without its isolated dither pixels)
 *   F42          (polish 3) also the hook-rip held for the frame (verb, phase, its clock) and the staging's report: the
 *                part on the hook and the gap from the hook's tip to it
 *   F44          (polish 3) also her own pixels and box, and the lens's view bearing and pitch
 */
export async function probe(frame) {
  const C = window.__CTX__, E = C.engine, env = C.environment, cam = C.camera, R = E.renderer;
  const THREE = await import('/tools/look/three.mjs');
  const id = frame?.id || '';
  const out = { frame: id };
  if (id === 'F45' || id === 'F45-trade') {
    try { const base = await import('/tools/world/calima-noon-probe-page.mjs'); out.calima = await base.probe(frame); } catch (e) { out.calima = { error: String(e?.message || e).slice(0, 300) }; }
  }
  const gl = R.getContext();
  const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight, W = innerWidth, H = innerHeight;
  const A = new Uint8Array(bw * bh * 4), B = new Uint8Array(bw * bh * 4);
  const draw = (buf) => { E.render(0); E.render(0); gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, buf); };
  const Yof = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const r1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
  // a pixel's hue (deg) and chroma (max - min) from 8-bit sRGB
  const hc = (r, g, b) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
    if (c < 1e-6) return { h: null, c: 0 };
    let h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
    h *= 60; if (h < 0) h += 360;
    return { h, c };
  };
  /** the pixels `obj` changes (shown vs hidden) and their means; buffer rows run bottom-up */
  const maskRead = (objs, { split = null, ring = 0 } = {}) => {
    const list = Array.isArray(objs) ? objs : [objs];
    const vis0 = list.map((o) => o.visible);
    list.forEach((o) => { o.visible = true; });
    draw(A);
    list.forEach((o) => { o.visible = false; });
    draw(B);
    list.forEach((o, i) => { o.visible = vis0[i]; });
    E.render(0);
    const mask = new Uint8Array(bw * bh);
    let n = 0, x0 = bw, y0 = bh, x1 = -1, y1 = -1;
    for (let i = 0, k = 0; i < A.length; i += 4, k++) {
      if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) <= 6) continue;
      mask[k] = 1; n++;
      const x = k % bw, y = bh - 1 - ((k / bw) | 0);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const stats = (pick) => {
      let m = 0; const sA = [0, 0, 0], sB = [0, 0, 0]; let paler = 0;
      for (let i = 0, k = 0; i < A.length; i += 4, k++) {
        if (!mask[k] || !pick(k)) continue;
        m++; sA[0] += A[i]; sA[1] += A[i + 1]; sA[2] += A[i + 2]; sB[0] += B[i]; sB[1] += B[i + 1]; sB[2] += B[i + 2];
        if (Yof(A[i], A[i + 1], A[i + 2]) > Yof(B[i], B[i + 1], B[i + 2]) + 3) paler++;
      }
      if (!m) return { pixels: 0 };
      const a = sA.map((v) => v / m), b = sB.map((v) => v / m), ha = hc(...a), hb = hc(...b);
      return { pixels: m, drawn: a.map(Math.round), behind: b.map(Math.round), yDrawn: r1(Yof(...a)), yBehind: r1(Yof(...b)), dY: r1(Yof(...a) - Yof(...b)),
        hueDrawn: r1(ha.h), hueBehind: r1(hb.h), chromaDrawn: r1(ha.c), chromaBehind: r1(hb.c), palerShare: Math.round(paler / m * 1000) / 1000 };
    };
    // the core box: the mask without its isolated pixels (a mask pixel with 3 or more of its 8 neighbours in the mask). Two
    // draws a frame apart differ in scattered single pixels far from the thing (the post chain's dither), which stretch
    // the plain box: at b87afe7 the Screed's ran 586 px tall where its body is about 200 px
    let cx0 = bw, cy0 = bh, cx1 = -1, cy1 = -1;
    for (let k = 0; k < mask.length; k++) {
      if (!mask[k]) continue;
      const x = k % bw, yb = (k / bw) | 0;
      let nb = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx, yy = yb + dy;
        if (xx >= 0 && xx < bw && yy >= 0 && yy < bh && mask[yy * bw + xx]) nb++;
      }
      if (nb < 3) continue;
      const y = bh - 1 - yb;
      if (x < cx0) cx0 = x; if (x > cx1) cx1 = x; if (y < cy0) cy0 = y; if (y > cy1) cy1 = y;
    }
    const res = { pixels: n, box: x1 >= 0 ? [x0, y0, x1, y1].map((v, i) => Math.round(v * (i % 2 ? H / bh : W / bw))) : null,
      coreBox: cx1 >= 0 ? [cx0, cy0, cx1, cy1].map((v, i) => Math.round(v * (i % 2 ? H / bh : W / bw))) : null, all: stats(() => true) };
    if (split) {
      // split at a buffer row (counted from the top): above = head, below = legs
      const yb = bh - 1 - Math.round(split * bh / H);
      res.above = stats((k) => ((k / bw) | 0) > yb);
      res.below = stats((k) => ((k / bw) | 0) <= yb);
      res.splitY = Math.round(split);
    }
    if (ring > 0 && n) {
      // the frame around the mask: pixels within `ring` px of it (and 3 px clear of it), as drawn
      const near = new Uint8Array(bw * bh);
      const R2 = ring, r0 = 3;
      for (let k = 0; k < mask.length; k++) {
        if (!mask[k]) continue;
        const x = k % bw, y = (k / bw) | 0;
        for (let dy = -R2; dy <= R2; dy += 2) for (let dx = -R2; dx <= R2; dx += 2) {
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= bw || yy >= bh) continue;
          const d = Math.max(Math.abs(dx), Math.abs(dy)); if (d < r0) continue;
          near[yy * bw + xx] = 1;
        }
      }
      // clear of the mask by r0
      for (let k = 0; k < mask.length; k++) if (mask[k]) { const x = k % bw, y = (k / bw) | 0; for (let dy = -r0; dy <= r0; dy++) for (let dx = -r0; dx <= r0; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < bw && yy < bh) near[yy * bw + xx] = 0; } }
      const ringStats = (pick) => { let m = 0; const s = [0, 0, 0]; for (let i = 0, k = 0; i < A.length; i += 4, k++) { if (!near[k] || !pick(k)) continue; m++; s[0] += A[i]; s[1] += A[i + 1]; s[2] += A[i + 2]; } return m ? { pixels: m, drawn: s.map((v) => Math.round(v / m)), y: r1(Yof(...s.map((v) => v / m))) } : { pixels: 0 }; };
      res.ring = ringStats(() => true);
      if (split) { const yb = bh - 1 - Math.round(split * bh / H); res.ringBelow = ringStats((k) => ((k / bw) | 0) <= yb); res.ringAbove = ringStats((k) => ((k / bw) | 0) > yb); }
    }
    return res;
  };
  const proj = (v) => { const q = v.clone().project(cam); return { x: Math.round((q.x * 0.5 + 0.5) * W), y: Math.round((0.5 - q.y * 0.5) * H), front: q.z < 1, inFrame: q.z < 1 && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 }; };

  /* ---- the sun's disc (the F45 frames) ---- */
  if (id.startsWith('F45')) {
    try {
      const sd = env.sunDir.clone().normalize();
      // (a point inside the far plane: the disc is drawn on the camera's own ray)
      const s = proj(cam.position.clone().addScaledVector(sd, Math.min(500, cam.far * 0.5)));
      const fwd = cam.getWorldDirection(new THREE.Vector3());
      const offDeg = Math.acos(Math.max(-1, Math.min(1, fwd.dot(sd)))) * 180 / Math.PI;
      const sun = { altitudeDeg: r1(env.sunAltitudeDeg), screen: [s.x, s.y], inFrame: s.inFrame, offAxisDeg: r1(offDeg) };
      if (s.inFrame) {
        draw(A);
        const fpx = (bh / 2) / Math.tan(cam.fov * Math.PI / 360);   // buffer px per unit tan
        const cx = s.x * bw / W, cy = s.y * bh / H;
        const ringY = (d0, d1) => { let m = 0, sum = 0; for (let a = 0; a < 360; a += 6) for (let d = d0; d <= d1; d += 0.5) { const r = Math.tan(d * Math.PI / 180) * fpx; const x = Math.round(cx + Math.cos(a * Math.PI / 180) * r), y = Math.round(cy + Math.sin(a * Math.PI / 180) * r); if (x < 0 || y < 0 || x >= bw || y >= bh) continue; const i = ((bh - 1 - y) * bw + x) * 4; sum += Yof(A[i], A[i + 1], A[i + 2]); m++; } return m ? r1(sum / m) : null; };
        sun.yCentre = ringY(0, 0.5); sun.yAt1to1_5 = ringY(1, 1.5); sun.yAt3 = ringY(3, 3.5); sun.yAt5to8 = ringY(5, 8); sun.yAt12to20 = ringY(12, 20);
        sun.contrast = sun.yCentre != null && sun.yAt5to8 ? r1((sun.yCentre - sun.yAt5to8) / sun.yAt5to8 * 100) : null;
        sun.note = 'display luminance (8-bit, Rec.709) at the disc centre and in rings (deg) round it; contrast = centre over the 5-8 deg ring, %';
      }
      out.sun = sun;
    } catch (e) { out.sun = { error: String(e?.message || e).slice(0, 300) }; }
    // the Kiln Yards: their pixels, and the ground just under them (a band 6-30 px under the mask, inside its x range)
    try {
      const ky = C.terrain?.kilnYards?.group;
      if (ky) {
        const r = maskRead(ky, { ring: 8 });
        if (r.box) {
          draw(A);
          let m = 0; const s = [0, 0, 0];
          const [x0, , x1, y1] = r.box.map((v, i) => Math.round(v * (i % 2 ? bh / H : bw / W)));
          for (let y = y1 + 6; y <= Math.min(bh - 1, y1 + 30); y++) for (let x = x0; x <= x1; x += 2) { const i = ((bh - 1 - y) * bw + x) * 4; s[0] += A[i]; s[1] += A[i + 1]; s[2] += A[i + 2]; m++; }
          r.groundUnder = m ? { pixels: m, drawn: s.map((v) => Math.round(v / m)), y: r1(Yof(...s.map((v) => v / m))) } : null;
        }
        const site = C.terrain.kilnYards;
        r.distM = r1(Math.hypot(219 - cam.position.x, 27 - cam.position.z));
        out.kilnYards = r;
      } else out.kilnYards = { error: 'no Kiln Yards far form' };
    } catch (e) { out.kilnYards = { error: String(e?.message || e).slice(0, 300) }; }
    // the Transit's far form, when it is up: legs (under the drum's foot) and head
    try {
      const T = C.transitFar;
      if (T?.root?.visible) {
        const head = T.head.clone();
        const split = proj(head.clone().add(new THREE.Vector3(0, -2.6, 0))).y;
        const r = maskRead(T.root, { split, ring: 10 });
        r.legsPalerThanBehind = r.below?.pixels ? r.below.yDrawn > r.below.yBehind : null;
        r.legsPalerThanAround = r.below?.pixels && r.ringBelow?.pixels ? r.below.yDrawn > r.ringBelow.y : null;
        r.distM = r1(Math.hypot(T.station.x - cam.position.x, T.station.z - cam.position.z));
        r.headScreen = proj(head);
        // the legs against the dust with the far form's albedo scaled (x the shipped value, transit.js ALBEDO): the read
        // the shipped value was chosen on
        const mats = []; T.root.traverse((o) => { if (o.isMesh && o.material?.color && !mats.includes(o.material)) mats.push(o.material); });
        const c0 = mats.map((m) => m.color.clone());
        r.albedoSweep = [];
        for (const k of [2, 1.4, 0.7]) {
          mats.forEach((m, i) => m.color.copy(c0[i]).multiplyScalar(k));
          const q = maskRead(T.root, { split, ring: 10 });
          r.albedoSweep.push({ k, legs: q.below?.yDrawn ?? null, behind: q.below?.yBehind ?? null, around: q.ringBelow?.y ?? null, head: q.above?.yDrawn ?? null });
        }
        mats.forEach((m, i) => m.color.copy(c0[i]));
        out.transit = r;
      } else out.transit = { shown: false };
    } catch (e) { out.transit = { error: String(e?.message || e).slice(0, 300) }; }
  }

  /* ---- F42: the Sickle against the meadow ---- */
  if (id.startsWith('F42')) {
    try {
      const m = (C.machines?.list || []).find((q) => q && q.kind === 'sickle' && !q._disposed);
      if (!m?.root) out.sickle = { error: 'no Sickle' };
      else {
        const r = maskRead(m.root, { ring: 8 });
        // its hull's own screen box (projected bounds), to read how much of it the grass hides
        const bb = new THREE.Box3().setFromObject(m.root);
        let lo = [1e9, 1e9], hi = [-1e9, -1e9];
        for (let k = 0; k < 8; k++) { const p = proj(new THREE.Vector3(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z)); lo = [Math.min(lo[0], p.x), Math.min(lo[1], p.y)]; hi = [Math.max(hi[0], p.x), Math.max(hi[1], p.y)]; }
        r.hullBox = [...lo, ...hi];
        r.hullBoxPx = Math.max(0, Math.min(W, hi[0]) - Math.max(0, lo[0])) * Math.max(0, Math.min(H, hi[1]) - Math.max(0, lo[1]));
        r.toHerM = r1(Math.hypot(m.position.x - C.player.position.x, m.position.z - C.player.position.z));
        r.lamp = { state: m.state ?? null, colour: m.lamp?.color?.getHexString?.() ?? m._lampColor ?? null };
        out.sickle = r;
      }
      const V = C.combat?.gaff?.verbs;
      out.gaff = { verb: V?.verb?.id ?? null, phase: V?.phase ?? null, k: V ? r1(V.k * 1000) / 1000 : null, t: V ? Math.round(V.t * 1000) / 1000 : null, staged: window.__f42 ?? null };
      if (m?.root && C.player?.model) out.her = (({ pixels, box }) => ({ pixels, box }))(maskRead(C.player.model));
    } catch (e) { out.sickle = { error: String(e?.message || e).slice(0, 300) }; }
  }

  /* ---- F44: the Alidade, the Windwall, the lookers ---- */
  if (id.startsWith('F44')) {
    try {
      const p = C.player, an = p?.animator, S = C.sighting, ww = C.combat?.windwall;
      const ali = an?.debugAlidade?.() ?? null;
      out.alidade = { sightingOn: !!S?.on, w: r1(an?._ali?.w * 1000) / 1000, aiming: !!p?.aiming, stance: C.combat?.melee?.stance ?? null, debug: ali };
      out.windwall = ww ? { owned: ww.owned, phase: ww.phase, plantedAt: ww.plantedAt ? { x: r1(ww.plantedAt.x), z: r1(ww.plantedAt.z), heading: r1(ww.plantedAt.heading * 180 / Math.PI) } : null, plants: ww.plants } : null;
      if (ww?.prop?.group) out.windwall.pixels = maskRead(ww.prop.group);
      const lk = (C.systemsGame?.hour?.spawned?.lookers || []).filter((m) => m && !m._disposed && m.root);
      out.lookers = lk.map((m) => {
        const r = maskRead(m.root);
        const P = p.position, at = ww?.plantedAt;
        let onLine = null;
        if (at) {
          // the planted fan's centre (plantAhead in front of where she stood) against the line from her to this looker
          const cx = at.x + Math.sin(at.heading) * 0.42, cz = at.z + Math.cos(at.heading) * 0.42;
          const dx = m.position.x - P.x, dz = m.position.z - P.z, L = Math.hypot(dx, dz);
          const t = ((cx - P.x) * dx + (cz - P.z) * dz) / (L * L);
          const ex = P.x + dx * t - cx, ez = P.z + dz * t - cz;
          onLine = { offLineM: r1(Math.hypot(ex, ez)), along: Math.round(t * 1000) / 1000 };
        }
        return { kind: m.kind, toHerM: r1(Math.hypot(m.position.x - P.x, m.position.z - P.z)), screen: proj(m.position.clone().add(new THREE.Vector3(0, 0.6, 0))), pixels: r.pixels, box: r.box, windwallOnLine: onLine };
      });
      const hr = p?.model ? maskRead(p.model) : null;
      out.herBox = hr ? hr.box : null; out.herPixels = hr ? hr.pixels : null;
      const fwd = cam.getWorldDirection(new THREE.Vector3());
      out.lens = { at: [r1(cam.position.x), r1(cam.position.y), r1(cam.position.z)], bearing: r1(((Math.atan2(fwd.x, -fwd.z) * 180 / Math.PI) + 360) % 360), pitch: r1(Math.asin(fwd.y) * 180 / Math.PI), aboveGround: r1(cam.position.y - C.terrain.getHeight(cam.position.x, cam.position.z)) };
    } catch (e) { out.f44error = String(e?.message || e).slice(0, 300); }
  }

  /* ---- F39-people: the five in the lens ---- */
  if (id.startsWith('F39-people') || id === 'F39-look') {
    try {
      const st = C.people?.holds?._staged || [];
      out.people = st.map((q) => {
        const g = q.group || q.root || q.model || null;
        const pos = g ? g.getWorldPosition(new THREE.Vector3()) : null;
        const r = g ? maskRead(g) : { pixels: null };
        return { id: q.id ?? q.castId ?? null, at: pos ? [r1(pos.x), r1(pos.z)] : null, screen: pos ? proj(pos.clone().add(new THREE.Vector3(0, 1, 0))) : null, pixels: r.pixels, boxH: r.box ? r.box[3] - r.box[1] : null, toHerM: pos ? r1(Math.hypot(pos.x - C.player.position.x, pos.z - C.player.position.z)) : null, toLensM: pos ? r1(Math.hypot(pos.x - cam.position.x, pos.z - cam.position.z)) : null };
      });
      out.peopleInLens = out.people.filter((q) => q.pixels > 0).length;
      if (id === 'F39-look') {
        out.staging = window.__f39look || null;   // where the staging put the five: bearing, metres to the Screed and to its threat lines
        out.fight = (C.machines?.list || []).filter((m) => m && !m._disposed && m.root && (m.kind === 'screed' || m.kind === 'sickle') && m.root.visible).map((m) => { const r = maskRead(m.root); return { kind: m.kind, pixels: r.pixels, boxH: r.box ? r.box[3] - r.box[1] : null, coreH: r.coreBox ? r.coreBox[3] - r.coreBox[1] : null, coreBox: r.coreBox, toLensM: r1(Math.hypot(m.position.x - cam.position.x, m.position.z - cam.position.z)) }; });
        out.peopleCore = st.map((q) => { const g = q.group || q.root || q.model; const r = g ? maskRead(g) : null; return { id: q.id ?? null, coreH: r?.coreBox ? r.coreBox[3] - r.coreBox[1] : null, coreBox: r?.coreBox || null }; });
        const hr = C.player?.model ? maskRead(C.player.model) : null;
        out.brea = hr ? { pixels: hr.pixels, boxH: hr.box ? hr.box[3] - hr.box[1] : null, coreH: hr.coreBox ? hr.coreBox[3] - hr.coreBox[1] : null, coreBox: hr.coreBox } : null;
      }
      out.machines = (C.machines?.list || []).filter((m) => m && !m._disposed && m.root).map((m) => ({ kind: m.kind, screen: proj(m.position.clone().add(new THREE.Vector3(0, 1, 0))) }));
    } catch (e) { out.peopleError = String(e?.message || e).slice(0, 300); }
  }
  E.render(0);
  return out;
}
