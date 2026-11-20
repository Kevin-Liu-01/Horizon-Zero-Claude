/**
 * Polish 2 (area B, the Holds people's look) — the page half. Run by
 *   node tools/frames/film.mjs --port <p> --only F36,F37 --no-review --probe /tools/build/recipes/npc/holds-look-probe-page.mjs
 * after each frame is staged, frozen and screenshotted.
 *
 * Every figure is read the way tools/build/recipes/npc/cast-probe-page.mjs reads its crowd: its pixels are the ones its own
 * solo render changes against the render with every figure hidden (all renders in one task, the world frozen, a channel
 * changing by more than 12). Of those pixels:
 *   violetPx   HSV hue 255-335 deg, saturation >= 0.22, value >= 0.12 (the crowd rows' violet)
 *   palePx     the salt-white linen read: value >= 0.55, saturation <= 0.30 (the Pans' cloth in this light; a Holds figure in
 *              dyed and undyed wool should carry little of it)
 *   mean       the figure's mean sRGB and CIE L*a*b*
 *
 *   F36   the five the staging stood (ctx.people.holds._staged), each with its rows; a 2.4 m front close-up of each (JPEG)
 *   F37   (1) Oro's portrait at the dialogue distance: the lens 2 m in front of him at 1.55 m, aimed at 1.3 m, fov 42, the
 *             frame's own 1600 x 900 (DPR 1.25); the full frame and a crop of his waist (the sash's crescent row), the crescent's
 *             width on screen (device px, from the lens) and the gold pixels in the crop
 *         (2) the 20 m line-up: the seven Holds people, Oro, four of the Pans' cast and Brea in one row 1.15 m apart, square to
 *             a lens 20 m off at 1.6 m, fov 45, all in Idle_Loop at LOD1 (the tier the game draws at 20 m), the village hidden
 *             for the open read and shown for the in-world one; each figure's rows; leave-one-out nearest-centroid on mean
 *             L*a*b* (Pans vs Holds); Brea's violet against every other figure's (bar 5x)
 * Everything it spawns is despawned; the lens and every visibility it touched are restored.
 */
const hsv = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx / 255, s = mx ? (mx - mn) / mx : 0;
  let h = 0;
  const d = mx - mn || 1;
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return [h, s, v];
};
const VIOLET = (r, g, b) => { const [h, s, v] = hsv(r, g, b); return v >= 0.12 && s >= 0.22 && h >= 255 && h <= 335; };
const PALE = (r, g, b) => { const [, s, v] = hsv(r, g, b); return v >= 0.55 && s <= 0.30; };
const GOLD = (r, g, b) => { const [h, s, v] = hsv(r, g, b); return h >= 25 && h <= 55 && s >= 0.3 && v >= 0.35; };
const lab = (rgb) => {
  const lin = rgb.map((c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
  const X = (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047, Y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2], Z = (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Each figure's rows in the frame as the lens stands (figures: [{ id, obj, faction }]). */
function readFigures(E, R, figures, grab) {
  E.render(0);
  const all = grab();
  const vis0 = figures.map((f) => f.obj.visible);
  figures.forEach((f) => { f.obj.visible = false; });
  E.render(0);
  const bg = grab();
  const rows = [];
  for (const f of figures) {
    f.obj.visible = true;
    E.render(0);
    const px = grab();
    let area = 0, violet = 0, pale = 0, sr = 0, sg = 0, sb = 0, seen = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (Math.max(Math.abs(px[i] - bg[i]), Math.abs(px[i + 1] - bg[i + 1]), Math.abs(px[i + 2] - bg[i + 2])) <= 12) continue;
      area++;
      sr += px[i]; sg += px[i + 1]; sb += px[i + 2];
      if (VIOLET(px[i], px[i + 1], px[i + 2])) violet++;
      if (PALE(px[i], px[i + 1], px[i + 2])) pale++;
      // seen in the full frame (not behind another figure or the world)
      if (all[i] === px[i] && all[i + 1] === px[i + 1] && all[i + 2] === px[i + 2]) seen++;
    }
    const mean = area ? [sr / area, sg / area, sb / area] : [0, 0, 0];
    rows.push({ id: f.id, faction: f.faction, areaPx: area, seenPx: seen, violetPx: violet, palePx: pale, paleShare: r3(pale / Math.max(1, area)), meanRGB: mean.map(Math.round), lab: lab(mean).map(r1) });
    f.obj.visible = false;
  }
  figures.forEach((f, i) => { f.obj.visible = vis0[i]; });
  E.render(0);
  return rows;
}

/** Leave-one-out nearest centroid on mean L*a*b*, Pans vs Holds; and the pale-share gap. */
function classify(rows) {
  const by = (fac, not) => rows.filter((r) => r.faction === fac && r !== not && r.areaPx > 0);
  const cen = (rs) => [0, 1, 2].map((k) => rs.reduce((s, r) => s + r.lab[k], 0) / Math.max(1, rs.length));
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const out = [];
  for (const r of rows.filter((x) => x.faction === 'pan' || x.faction === 'holds')) {
    const cp = cen(by('pan', r)), ch = cen(by('holds', r));
    const dp = dist(r.lab, cp), dh = dist(r.lab, ch);
    out.push({ id: r.id, faction: r.faction, readsAs: dh < dp ? 'holds' : 'pan', dPan: r1(dp), dHolds: r1(dh), paleShare: r.paleShare });
  }
  const holds = rows.filter((r) => r.faction === 'holds'), pans = rows.filter((r) => r.faction === 'pan');
  return {
    rows: out,
    correct: out.filter((o) => o.readsAs === o.faction).length, of: out.length,
    holdsWrong: out.filter((o) => o.faction === 'holds' && o.readsAs !== 'holds').map((o) => o.id),
    paleHoldsMax: Math.max(...holds.map((r) => r.paleShare)), palePansMin: Math.min(...pans.map((r) => r.paleShare)),
  };
}

function violetBar(rows) {
  const brea = rows.find((r) => r.id === 'brea');
  const other = rows.filter((r) => r.id !== 'brea').reduce((m, r) => (r.violetPx > m.violetPx ? r : m), { violetPx: 0, id: null });
  return brea ? { brea: brea.violetPx, maxOther: { id: other.id, px: other.violetPx }, ratio: r3(brea.violetPx / Math.max(1, other.violetPx)), bar: 5 } : null;
}

export async function probe(frame) {
  if (frame?.id !== 'F36' && frame?.id !== 'F37') return { skipped: 'measured on F36 and F37 only' };
  const THREE = await import('/tools/look/three.mjs');
  const C = window.__CTX__, E = C.engine, R = E.renderer, cam = C.camera, p = C.player, PS = C.people;
  const W = R.domElement.width, H = R.domElement.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g2 = cv.getContext('2d', { willReadFrequently: true });
  const grab = () => { g2.drawImage(R.domElement, 0, 0); return g2.getImageData(0, 0, W, H).data; };
  const cam0 = { pos: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov };
  const restoreCam = () => { cam.position.copy(cam0.pos); cam.quaternion.copy(cam0.q); cam.fov = cam0.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); };
  const out = { frame: { W, H } };
  const undo = [], spawned = [];
  try {
    if (frame.id === 'F36') {
      const staged = (PS?.holds?._staged || []).filter((q) => q.group);
      const figs = staged.map((q) => ({ id: q.archetype || q.id, obj: q.group, faction: 'holds', q }));
      if (p.model?.visible) figs.push({ id: 'brea', obj: p.model, faction: 'brea' });
      out.rows = readFigures(E, R, figs, grab);
      out.violet = violetBar(out.rows);
      out.closeups = {};
      for (const f of figs.filter((x) => x.q)) {
        const a = f.q, foot = a.group.position.clone(), fwd = new THREE.Vector3(Math.sin(a.group.rotation.y), 0, Math.cos(a.group.rotation.y));
        cam.position.copy(foot).addScaledVector(fwd, 2.4).add(new THREE.Vector3(0, 1.2, 0));
        cam.lookAt(foot.clone().add(new THREE.Vector3(0, 0.85, 0))); cam.fov = 42; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
        E.render(0);
        out.closeups[f.id] = R.domElement.toDataURL('image/jpeg', 0.88);
      }
      restoreCam(); E.render(0);
      return out;
    }

    /* ---- F37: (1) Oro's portrait at 2 m ---- */
    const oro = (PS?.list || []).filter((q) => q.archetype === 'oro' || q.id === 'oro').sort((a, b) => a.group.position.distanceTo(p.position) - b.group.position.distanceTo(p.position))[0];
    if (!oro) return { error: 'no Oro staged' };
    {
      const foot = oro.group.position.clone(), fwd = new THREE.Vector3(Math.sin(oro.group.rotation.y), 0, Math.cos(oro.group.rotation.y));
      const DIST = 2.0, FOV = 42;
      cam.position.copy(foot).addScaledVector(fwd, DIST).add(new THREE.Vector3(0, 1.55, 0));
      cam.lookAt(foot.clone().add(new THREE.Vector3(0, 1.3, 0))); cam.fov = FOV; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      E.render(0);
      const portrait = R.domElement.toDataURL('image/jpeg', 0.92);
      // the sash's front on screen: his pelvis bone's height and the build's ring at bind y 1.06 (pelvis at about 0.98 in the bind)
      const pb = oro.bones?.pelvis; const pv = new THREE.Vector3();
      if (pb) pb.getWorldPosition(pv); else pv.copy(foot).add(new THREE.Vector3(0, 0.98, 0));
      const sashC = pv.clone().add(new THREE.Vector3(0, 0.08 * (oro.scale || 1), 0)).addScaledVector(fwd, 0.17);
      const scr = (v) => { const q = v.clone().project(cam); return [(q.x + 1) / 2 * W, (1 - q.y) / 2 * H]; };
      const c = scr(sashC), right = new THREE.Vector3(fwd.z, 0, -fwd.x);
      const e1 = scr(sashC.clone().addScaledVector(right, 0.014)), e0 = scr(sashC.clone().addScaledVector(right, -0.014));
      const crescentPx = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]);
      // the waist crop: 0.6 m wide, 0.2 m tall about the sash's front
      const tl = scr(sashC.clone().addScaledVector(right, -0.3).add(new THREE.Vector3(0, 0.1, 0)));
      const br = scr(sashC.clone().addScaledVector(right, 0.3).add(new THREE.Vector3(0, -0.1, 0)));
      const x0 = Math.max(0, Math.round(Math.min(tl[0], br[0]))), y0 = Math.max(0, Math.round(Math.min(tl[1], br[1])));
      const x1 = Math.min(W, Math.round(Math.max(tl[0], br[0]))), y1 = Math.min(H, Math.round(Math.max(tl[1], br[1])));
      const px = grab();
      let gold = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; n++; if (GOLD(px[i], px[i + 1], px[i + 2])) gold++; }
      const cc = document.createElement('canvas'); cc.width = (x1 - x0) * 3; cc.height = (y1 - y0) * 3;
      const c2 = cc.getContext('2d'); c2.imageSmoothingEnabled = false; c2.drawImage(R.domElement, x0, y0, x1 - x0, y1 - y0, 0, 0, cc.width, cc.height);
      out.portrait = {
        lens: { distM: DIST, heightM: 1.55, aimM: 1.3, fov: FOV, device: [W, H] },
        sashScreen: c.map(Math.round), crescentWidthPx: r1(crescentPx), crop: [x0, y0, x1, y1], cropGoldPx: gold, cropPx: n, cropGoldShare: r3(gold / Math.max(1, n)),
        image: portrait, sashCrop: cc.toDataURL('image/png'),
      };
    }

    /* ---- F37: (2) the 20 m line-up ---- */
    const order = ['salt-raker', 'pit-farmer', 'tiller-follower', 'salt-porter', 'cochineal-picker', 'pit-farmer-2', 'brea', 'boat-caulker', 'tiller-follower-2', 'cochineal-picker-2', 'lantern-keeper', 'pit-farmer-3', 'oro'];
    restoreCam();
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const B = p.position.clone(), iB = order.indexOf('brea');
    const lensAt = B.clone().addScaledVector(fwd, -20);
    const faceYaw = (x, z) => Math.atan2(lensAt.x - x, lensAt.z - z);
    const figures = [];
    const others = (PS.list || []).filter((q) => q !== oro);
    for (const q of others) { const v = q.group.visible; q.group.visible = false; undo.push(() => { q.group.visible = v; }); }
    const oroAt = oro.group.position.clone(), oroYaw = oro.group.rotation.y, oroYawF = oro.yaw;
    undo.push(() => { oro.setPosition?.(oroAt.x, oroAt.z); oro.yaw = oroYawF; oro.group.rotation.y = oroYaw; PS.tierAt(oro, null); });
    for (let i = 0; i < order.length; i++) {
      const id = order[i], at = B.clone().addScaledVector(right, (i - iB) * 1.15);
      if (id === 'brea') { figures.push({ id, obj: p.model, faction: 'brea' }); continue; }
      let q = id === 'oro' ? oro : null;
      if (!q) { q = await PS.spawn(id, { x: at.x, z: at.z, yaw: 0 }); spawned.push(q); }
      q.setPosition?.(at.x, at.z); q.stopWalk?.();
      const y = faceYaw(at.x, at.z); q.yaw = y; q.group.rotation.y = y;
      try { for (const c of q.chains?.chains || []) { c.links.forEach((l, k) => l.quaternion.copy(c.bindQ[k])); c.seeded = false; } } catch (e) { /* */ }
      try { q.play?.('Idle_Loop', { fade: 0, offset: 0.25 }); } catch (e) { /* */ }
      PS.tierAt(q, 1);
      figures.push({ id, obj: q.group, faction: q.spec?.faction || (id.match(/salt|boat|lantern/) ? 'pan' : 'holds'), q });
    }
    const h0 = p.heading; p.heading = faceYaw(B.x, B.z); undo.push(() => { p.heading = h0; });
    await sleep(2500);
    const ground = (x, z) => C.terrain?.getHeight?.(x, z) ?? p.position.y;
    const centre = B.clone().addScaledVector(right, ((order.length - 1) / 2 - iB) * 1.15);
    const putLens = () => {
      cam.position.set(lensAt.x, ground(lensAt.x, lensAt.z) + 1.6, lensAt.z);
      cam.lookAt(centre.x, ground(centre.x, centre.z) + 0.95, centre.z); cam.fov = 45; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    };
    putLens();
    out.lineup = { lens: { distM: 20, fov: 45, at: [lensAt.x, cam.position.y, lensAt.z].map(r3) }, order, tiers: figures.filter((f) => f.q).map((f) => ({ id: f.id, tier: f.q.tier })) };
    // in the world as it stands
    E.render(0);
    out.lineup.imageWorld = R.domElement.toDataURL('image/jpeg', 0.9);
    out.lineup.world = readFigures(E, R, figures, grab);
    // the open read: the village hidden
    const town = [];
    C.scene?.traverse?.((o) => { if (o.name === 'ninewalls' || o.name === 'settlement-host') town.push(o); });
    const town0 = town.map((o) => o.visible);
    town.forEach((o) => { o.visible = false; });
    try {
      E.render(0);
      out.lineup.imageOpen = R.domElement.toDataURL('image/jpeg', 0.9);
      out.lineup.open = readFigures(E, R, figures, grab);
    } finally { town.forEach((o, k) => { o.visible = town0[k]; }); }
    out.lineup.townHidden = town.map((o) => o.name);
    out.lineup.classifyOpen = classify(out.lineup.open);
    out.lineup.classifyWorld = classify(out.lineup.world);
    out.lineup.violetOpen = violetBar(out.lineup.open);
    out.lineup.violetWorld = violetBar(out.lineup.world);
    // a 2x crop of the row (open) to look at
    {
      const xs = [], ys = [];
      for (const f of figures) { const v = f.obj.getWorldPosition(new THREE.Vector3()); for (const dy of [0, 1.9]) { const q = v.clone().add(new THREE.Vector3(0, dy, 0)).project(cam); xs.push((q.x + 1) / 2 * W); ys.push((1 - q.y) / 2 * H); } }
      town.forEach((o) => { o.visible = false; }); E.render(0);
      const x0 = Math.max(0, Math.min(...xs) - 40), x1 = Math.min(W, Math.max(...xs) + 40), y0 = Math.max(0, Math.min(...ys) - 30), y1 = Math.min(H, Math.max(...ys) + 30);
      const cc = document.createElement('canvas'); cc.width = (x1 - x0) * 2; cc.height = (y1 - y0) * 2;
      const c2 = cc.getContext('2d'); c2.drawImage(R.domElement, x0, y0, x1 - x0, y1 - y0, 0, 0, cc.width, cc.height);
      out.lineup.cropOpen = cc.toDataURL('image/jpeg', 0.92);
      town.forEach((o, k) => { o.visible = town0[k]; });
    }
  } catch (e) {
    out.error = String(e?.stack || e).slice(0, 600);
  } finally {
    for (const q of spawned) { try { PS.tierAt(q, null); PS.despawn(q); } catch (e) { /* */ } }
    for (const u of undo.reverse()) { try { u(); } catch (e) { /* */ } }
    restoreCam();
    try { E.render(0); } catch (e) { /* */ }
  }
  return out;
}
