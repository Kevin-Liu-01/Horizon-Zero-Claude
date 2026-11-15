/**
 * BUILD M1.5c — the cast probe, the page half (lane people). Run by
 *   node tools/frames/film.mjs --port <p> --only F20 --probe /tools/build/recipes/npc/cast-probe-page.mjs
 * after F20 is staged and screenshotted (Brea and Ansel at the rest site, 17:30, the trade wind). On F20 it stands the slice's cast
 * (ctx.people.cast) in one row with Brea and Ansel, every person facing the lens and held at the near tier, lets them settle in
 * their first idle clip for 3 s, and measures:
 *
 *   crowd      the crowd frame: the row of ten through the game's own render (E.render, the same post), lens 11 m off at 1.2 m,
 *              45 deg; a JPEG data URL
 *   violet     each figure's violet area in that frame: the pixels its own solo render changes against the row-less render
 *              (every figure hidden; all renders in one task, so wind and time do not move between them) that read violet
 *              (HSV hue 255-335 deg, saturation >= 0.22, value >= 0.12). Bar (BUILD M1.5c): Brea's is >= 5x every other figure's
 *   people     per cast member: tier, clip, drawn meshes and triangles (bars: <= 4 draws, <= 30 k triangles)
 *   faces      a face close-up of each cast member (0.8 m, 30 deg, their three-quarter), JPEG data URLs
 * Everything it spawns is despawned; the lens and every visibility it touched are restored.
 */
const VIOLET = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx / 255, s = mx ? (mx - mn) / mx : 0;
  if (v < 0.12 || s < 0.22) return false;
  let h;
  const d = mx - mn || 1;
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return h >= 255 && h <= 335;
};

export async function probe(frame) {
  if (frame?.id !== 'F20') return { skipped: 'measured on F20 only' };
  const THREE = await import('/tools/look/three.mjs');
  const C = window.__CTX__, E = C.engine, R = E.renderer, cam = C.camera, p = C.player, PS = C.people;
  if (!PS?.spawn || !PS.cast) return { error: 'no people system with a cast' };
  const out = { cast: PS.cast.slice() };
  const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
  const ground = (x, z) => C.terrain?.getHeight?.(x, z) ?? p.position.y;
  const undo = [];
  const spawned = [];
  try {
    // the row: through Brea, square to the lens's horizontal view; Brea at 0, Ansel and the cast in slots either side
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const B = p.position.clone();
    const ansel = (PS.list || []).find((q) => q.archetype === 'guild-matron');
    const slots = [-4, -3, -2, -1, 1, 2, 3, 4, 5];
    const who = ['guild-matron', ...PS.cast];
    const centre = B.clone().addScaledVector(right, 0.5);
    // the lens 11 m off the row on the side the frame's own lens stands; turned to the other side below if the world (Saltrow's
    // houses and salt cones) hides more of the row from this one
    let lensAt = centre.clone().addScaledVector(fwd, -11);
    const faceYaw = (x, z) => Math.atan2(lensAt.x - x, lensAt.z - z);
    const figures = [{ id: 'brea', obj: p.model, person: null }];
    for (let i = 0; i < who.length; i++) {
      const at = B.clone().addScaledVector(right, slots[i]);
      let q;
      if (who[i] === 'guild-matron' && ansel) { q = ansel; q.setPosition?.(at.x, at.z); }
      else { q = await PS.spawn(who[i], { x: at.x, z: at.z, yaw: 0 }); q.setPosition?.(at.x, at.z); spawned.push(q); }
      const y = faceYaw(at.x, at.z);
      q.stopWalk?.(); q.yaw = y; q.group.rotation.y = y;
      try { for (const c of q.chains?.chains || []) { c.links.forEach((l, k) => l.quaternion.copy(c.bindQ[k])); c.seeded = false; } } catch (e) { /* */ }
      const idle = q.spec?.clips?.idle || ['Idle_Loop'];
      try { q.play?.(idle[0], { fade: 0, offset: 0.25 }); } catch (e) { /* */ }
      PS.tierAt(q, 0);
      figures.push({ id: who[i], obj: q.group, person: q });
    }
    // Brea faces the lens too
    const h0 = p.heading; p.heading = faceYaw(B.x, B.z); undo.push(() => { p.heading = h0; });
    await new Promise((r) => setTimeout(r, 3000));

    // ---- the crowd frame and the solo renders, all in this one task
    const cam0 = { pos: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov };
    undo.push(() => { cam.position.copy(cam0.pos); cam.quaternion.copy(cam0.q); cam.fov = cam0.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); });
    const others = (PS.list || []).filter((q) => !figures.some((f) => f.person === q));
    for (const q of others) { const v = q.group.visible; q.group.visible = false; undo.push(() => { q.group.visible = v; }); }
    const W = R.domElement.width, H = R.domElement.height;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g2 = cv.getContext('2d', { willReadFrequently: true });
    const grab = () => { g2.drawImage(R.domElement, 0, 0); return g2.getImageData(0, 0, W, H).data; };
    const vis0 = figures.map((f) => f.obj.visible);
    const putLens = () => {
      cam.position.set(lensAt.x, ground(lensAt.x, lensAt.z) + 1.3, lensAt.z);
      cam.lookAt(centre.x, ground(centre.x, centre.z) + 0.95, centre.z); cam.fov = 45; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    };
    // how much of the row a lens sees: the pixels the row changes against the row-less render
    const seen = () => {
      putLens(); E.render(0); const a = grab();
      figures.forEach((f) => { f.obj.visible = false; }); E.render(0); const b = grab();
      figures.forEach((f, i) => { f.obj.visible = vis0[i]; });
      let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 12) n++;
      return n;
    };
    const near = seen();
    const lensNear = lensAt.clone();
    lensAt = centre.clone().addScaledVector(fwd, 11);
    const far = seen();
    out.lensChoice = { framesSide: near, otherSide: far };
    if (far > near * 1.2) {
      // the row turns to the open side and settles again
      for (const f of figures) {
        if (!f.person) continue;
        const q = f.person, at = q.group.position, y = faceYaw(at.x, at.z);
        q.yaw = y; q.group.rotation.y = y;
        try { for (const c of q.chains?.chains || []) { c.links.forEach((l, k) => l.quaternion.copy(c.bindQ[k])); c.seeded = false; } } catch (e) { /* */ }
      }
      cam.position.copy(cam0.pos); cam.quaternion.copy(cam0.q); cam.fov = cam0.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      await new Promise((r) => setTimeout(r, 2500));
    } else lensAt = lensNear;
    putLens();
    out.lens = { at: [lensAt.x, cam.position.y, lensAt.z].map(r3), look: [centre.x, centre.z].map(r3), brea: [B.x, B.y, B.z].map(r3), row: figures.map((f) => ({ id: f.id, at: [f.obj.getWorldPosition(new THREE.Vector3()).x, f.obj.getWorldPosition(new THREE.Vector3()).y, f.obj.getWorldPosition(new THREE.Vector3()).z].map(r3) })) };
    // (M1.5c fix round, judge item 8) the crowd measured twice: in the world as it stands, and with the town hidden (Saltrow's
    // houses and cones hid lantern-keeper-2 and most of Ansel at 600521b), so every figure of the ten is whole in the frame; each
    // row also reports its area in the world against its area in the open (the share of the figure the world hides)
    const measure = (key) => {
      E.render(0);
      const crowd = R.domElement.toDataURL('image/jpeg', 0.9);
      const all = grab();
      figures.forEach((f) => { f.obj.visible = false; });
      E.render(0);
      const bg = grab();
      const rows = [];
      for (const f of figures) {
        f.obj.visible = true;
        E.render(0);
        const px = grab();
        let area = 0, violet = 0, violetInCrowd = 0;
        for (let i = 0; i < px.length; i += 4) {
          if (Math.max(Math.abs(px[i] - bg[i]), Math.abs(px[i + 1] - bg[i + 1]), Math.abs(px[i + 2] - bg[i + 2])) <= 12) continue;
          area++;
          if (VIOLET(px[i], px[i + 1], px[i + 2])) { violet++; if (VIOLET(all[i], all[i + 1], all[i + 2])) violetInCrowd++; }
        }
        rows.push({ id: f.id, areaPx: area, violetPx: violet, violetInCrowdPx: violetInCrowd, violetShare: r3(violet / Math.max(1, area)) });
        f.obj.visible = false;
      }
      figures.forEach((f, i) => { f.obj.visible = vis0[i]; });
      const brea = rows.find((r) => r.id === 'brea');
      const maxOther = rows.filter((r) => r.id !== 'brea').reduce((m, r) => (r.violetPx > m.violetPx ? r : m), { violetPx: 0, id: null });
      return { crowd, v: { key, frame: { W, H, lensM: 11, fov: 45 }, rows, brea: brea.violetPx, maxOther: { id: maxOther.id, px: maxOther.violetPx }, ratio: r3(brea.violetPx / Math.max(1, maxOther.violetPx)), bar: 5 } };
    };
    const inWorld = measure('world');
    out.crowd = inWorld.crowd;
    out.violet = inWorld.v;
    const town = [];
    C.scene?.traverse?.((o) => { if (o.name === 'settlement-host' || o.name === 'saltrow') town.push(o); });
    const town0 = town.map((o) => o.visible);
    town.forEach((o) => { o.visible = false; });
    try {
      const open = measure('open');
      out.crowdOpen = open.crowd;
      out.violetOpen = open.v;
      out.violetOpen.townHidden = town.map((o) => o.name);
      for (const r of out.violet.rows) { const o = open.v.rows.find((x) => x.id === r.id); r.openAreaPx = o?.areaPx ?? null; r.seenShare = o?.areaPx ? r3(r.areaPx / o.areaPx) : null; }
    } finally { town.forEach((o, k) => { o.visible = town0[k]; }); }

    // ---- per person: tier, clip, draws, triangles
    out.people = figures.filter((f) => f.person && PS.cast.includes(f.id)).map((f) => {
      const q = f.person, drawn = [];
      q.group.traverse((o) => {
        if (!o.isMesh || !o.visible || o.name === 'Caster') return;
        let vis = true; for (let u = o.parent; u; u = u.parent) if (!u.visible) vis = false;
        if (!vis) return;
        const g = o.geometry; drawn.push({ mesh: o.name, tris: Math.round((g.index ? g.index.count : g.attributes.position.count) / 3) });
      });
      return { id: f.id, tier: q.tier, clip: q.current?.getClip?.().name || null, draws: drawn.length, tris: drawn.reduce((s, d) => s + d.tris, 0), meshes: drawn };
    });

    // ---- faces: each cast member alone, their three-quarter at 0.8 m
    out.faces = {};
    for (const f of figures.filter((x) => PS.cast.includes(x.id) || x.id === 'guild-matron')) {
      figures.forEach((x) => { x.obj.visible = x === f; });
      const q = f.person, B2 = q.bones || {};
      const hb = B2.Head || B2.head;
      const hp = new THREE.Vector3(); if (hb) hb.getWorldPosition(hp); else hp.copy(q.group.position).add(new THREE.Vector3(0, 1.62, 0));
      hp.y += 0.04;
      const fy = q.group.rotation.y + 0.45, dir = new THREE.Vector3(Math.sin(fy), 0, Math.cos(fy));
      cam.position.copy(hp).addScaledVector(dir, 0.8); cam.position.y += 0.02;
      cam.lookAt(hp); cam.fov = 30; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      E.render(0);
      out.faces[f.id] = R.domElement.toDataURL('image/jpeg', 0.88);
    }
    figures.forEach((f, i) => { f.obj.visible = vis0[i]; });
  } catch (e) {
    out.error = String(e?.stack || e).slice(0, 600);
  } finally {
    for (const q of spawned) { try { PS.tierAt(q, null); PS.despawn(q); } catch (e) { /* */ } }
    for (const u of undo.reverse()) { try { u(); } catch (e) { /* */ } }
    try { E.render(0); } catch (e) { /* */ }
  }
  return out;
}
