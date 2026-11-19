/**
 * M2 polish — the Oro probe, the page half (lane people; the outfit sheet of his own, lib/oro-sheet.mjs). Run by
 *   node tools/frames/film.mjs --port <p> --only F37 --probe /tools/build/recipes/npc/oro-probe-page.mjs
 * after F37 is staged and screenshotted (the world frozen). On F37 it measures:
 *
 *   person     Oro as staged: his tier, the clip playing, her distance to Brea (bar 3 m)
 *   draws      the meshes of hers drawn in this frame (visible, in the tier shown; the shadow-only Caster excluded) and
 *              their triangles (bars: <= 4 draws, <= 30 k triangles)
 *   pose       not the bind pose: each upper arm's angle below the horizontal (the T-pose holds both at about 0 deg)
 *              and the largest bone rotation away from the bind pose
 *   closeups   extra renders through the game's own frame (E.render, the same post), the lens moved: his front at
 *              2.3 m, his three-quarter at 1.35 m, his back at 2 m, his face; JPEG data URLs
 * Reads window.__CTX__ only; restores the camera it found.
 */
export async function probe(frame) {
  if (frame?.id === 'F36') return street();
  if (frame?.id !== 'F37') return { skipped: 'measured on F37 and F36 only' };
  const THREE = await import('/tools/look/three.mjs');
  const C = window.__CTX__, E = C.engine, R = E.renderer, cam = C.camera, p = C.player;
  const out = {};
  const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
  const P = (C.people?.list || []).filter((q) => q.archetype === 'oro' || q.id === 'oro');
  if (!P.length) return { error: 'no Oro staged', people: (C.people?.list || []).map((q) => q.archetype || q.id) };
  P.sort((a, b) => a.group.position.distanceTo(p.position) - b.group.position.distanceTo(p.position));
  const a = P[0];
  a.root.updateMatrixWorld(true);
  out.person = { id: a.id, tier: a.tier, clip: a.current?.name || a.pose?.current?.name || null, distToBreaM: r3(Math.hypot(a.group.position.x - p.position.x, a.group.position.z - p.position.z)), scale: r3(a.scale) };
  // draws and triangles in this frame
  const drawn = [];
  a.group.traverse((o) => {
    if (!o.isMesh || !o.visible || o.name === 'Caster') return;
    let vis = true; for (let q = o.parent; q; q = q.parent) if (!q.visible) vis = false;
    if (!vis) return;
    const g = o.geometry, tri = (g.index ? g.index.count : g.attributes.position.count) / 3;
    drawn.push({ mesh: o.name, material: o.material?.name || null, tris: Math.round(tri), maps: !!o.material?.map });
  });
  out.draws = { count: drawn.length, tris: drawn.reduce((s, d) => s + d.tris, 0), meshes: drawn, bars: { draws: 4, tris: 30000 } };
  // the pose
  const B = a.bones;
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  const armDown = (s) => {
    const u = B[`upperarm_${s}`], l = B[`lowerarm_${s}`];
    if (!u || !l) return null;
    u.getWorldPosition(v); l.getWorldPosition(w);
    const d = w.sub(v).normalize();
    return r3(Math.asin(Math.max(-1, Math.min(1, -d.y))) * 180 / Math.PI);
  };
  let maxRot = 0;
  for (const n of ['upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'spine_02', 'thigh_l', 'thigh_r']) {
    const b = B[n]; if (!b) continue;
    const bind = b.userData?.bindQuat || null;
    if (bind) maxRot = Math.max(maxRot, 2 * Math.acos(Math.min(1, Math.abs(b.quaternion.dot(bind)))) * 180 / Math.PI);
  }
  out.pose = { upperArmBelowHorizontalDeg: { l: armDown('l'), r: armDown('r') }, maxBoneRotFromBindDeg: maxRot ? r3(maxRot) : null, bar: 'both upper arms more than 25 deg below the horizontal, or a clip playing that folds them' };
  // close-ups through the game's own render
  const cam0 = { pos: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov };
  const box = new THREE.Box3();
  for (const m of a.tierMeshes?.[Math.max(0, a.tier)] || []) { m.computeBoundingBox?.(); if (m.boundingBox) box.union(m.boundingBox.clone().applyMatrix4(m.matrixWorld)); }
  const foot = a.group.position.clone();
  const top = box.isEmpty() ? foot.y + 1.64 : box.max.y;
  const fwd = new THREE.Vector3(Math.sin(a.group.rotation.y), 0, Math.cos(a.group.rotation.y));
  const shot = (dist, yawOff, h, aimH, fov) => {
    const dir = fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yawOff);
    const target = foot.clone().add(new THREE.Vector3(0, aimH, 0));
    cam.position.copy(foot).addScaledVector(dir, dist).add(new THREE.Vector3(0, h, 0));
    cam.lookAt(target); cam.fov = fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    E.render(0);
    return R.domElement.toDataURL('image/jpeg', 0.9);
  };
  try {
    out.closeups = {
      front: shot(2.3, 0, 1.15, 0.92, 42),
      threeQuarter: shot(1.35, 0.6, 1.4, 1.2, 40),
      chest: shot(1.0, 0.3, 1.35, 1.22, 38),
      legs: shot(1.5, -0.35, 0.75, 0.55, 40),
      side: shot(1.7, -1.35, 1.1, 0.9, 42),
      face: shot(0.75, 0.25, top - foot.y - 0.12, top - foot.y - 0.14, 30),
    };
  } catch (e) { out.closeups = { error: String(e?.message || e).slice(0, 300) }; }
  cam.position.copy(cam0.pos); cam.quaternion.copy(cam0.q); cam.fov = cam0.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  E.render(0);
  out.heightM = r3(top - foot.y);
  return out;
}

/**
 * F36 (the street at work): the Holds people's own sheets close to: each of the four nearest the lens from 2.2 m in front of
 * them at their chest height (the game's own render, the lens restored after), with its tier and archetype.
 */
async function street() {
  const THREE = await import('/tools/look/three.mjs');
  const C = window.__CTX__, E = C.engine, R = E.renderer, cam = C.camera;
  const cam0 = { pos: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov };
  const P = (C.people?.list || []).filter((q) => q.group?.visible !== false);
  P.sort((a, b) => a.group.position.distanceTo(cam0.pos) - b.group.position.distanceTo(cam0.pos));
  const out = { people: [] };
  try {
    for (const a of P.slice(0, 4)) {
      const foot = a.group.position.clone(), fwd = new THREE.Vector3(Math.sin(a.group.rotation.y), 0, Math.cos(a.group.rotation.y));
      cam.position.copy(foot).addScaledVector(fwd, 2.2).add(new THREE.Vector3(0, 1.2, 0));
      cam.lookAt(foot.clone().add(new THREE.Vector3(0, 0.9, 0))); cam.fov = 42; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      E.render(0);
      out.people.push({ id: a.id, archetype: a.archetype, tier: a.tier, distM: Math.round(foot.distanceTo(cam0.pos) * 10) / 10 });
      (out.closeups ||= {})[a.archetype] = R.domElement.toDataURL('image/jpeg', 0.9);
    }
  } catch (e) { out.error = String(e?.message || e).slice(0, 300); }
  cam.position.copy(cam0.pos); cam.quaternion.copy(cam0.q); cam.fov = cam0.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  E.render(0);
  return out;
}
