/* world-ground fix round 2: the judge's own isolation cameras.
 * window.__WG_MODE__ selects: '' (as shipped), 'nogtao', 'vconly' (plain
 * MeshStandardMaterial with vertexColors:true and the custom shader removed),
 * 'novc' (plain material, vertexColors off).
 * window.__WG_CAM__ selects: 'gate' (V33 gate camera), 'close' (150 m from
 * (0,-250) at the wall), 'scree' (60 m at the west escarpment).
 */
(() => {
  const ctx = __CTX__, cam = ctx.camera, T = ctx.terrain;
  const mode = window.__WG_MODE__ || '';
  const which = window.__WG_CAM__ || 'gate';
  ctx.environment?.setWeather?.('clear', 0);
  const p = ctx.player;
  p._updateCamera = () => {};
  if (ctx.studio) ctx.studio.update = () => {};

  if (mode === 'nogtao' || mode === 'vconly' || mode === 'novc') {
    const g = ctx.engine.gtao;
    if (g) g.enabled = false;
    const passes = ctx.engine.composer?.passes || [];
    for (const ps of passes) {
      if (ps && ps.constructor && /GTAO/i.test(ps.constructor.name)) ps.enabled = false;
      if (ps && 'blendIntensity' in ps) ps.blendIntensity = 0;
    }
  }
  if (mode === 'flatvc') {
    // same plain material and the same vertexColors path, but the colour
    // attribute is a constant: anything that still bands is LIGHTING.
    const c = T.mesh.geometry.attributes.color;
    for (let i = 0; i < c.count; i++) c.setXYZ(i, 0.72, 0.68, 0.62);
    c.needsUpdate = true;
  }
  if (mode === 'vconly' || mode === 'novc' || mode === 'flatvc') {
    const m = T.mesh.material;
    T.mesh.material = new m.constructor({
      vertexColors: mode !== 'novc', color: mode === 'novc' ? 0x8f8578 : 0xffffff,
      roughness: 0.94, metalness: 0,
    });
  }

  if (window.__WG_NOSHADOW__) {
    T.mesh.receiveShadow = false;
    T.mesh.castShadow = false;
    ctx.renderer.shadowMap.enabled = false;
    if (T.mesh.material) T.mesh.material.needsUpdate = true;
  }
  if (window.__WG_SMOOTHN__) {
    T.mesh.geometry.computeVertexNormals();
    T.mesh.geometry.attributes.normal.needsUpdate = true;
  }
  if (window.__WG_HSNORM__) {
    // analytic normal from the FILTERED height field
    const g = T.mesh.geometry, pa = g.attributes.position, na = g.attributes.normal;
    const hg = T._hg, sd = hg.n, st = hg.step, HS = hg.HS;
    for (let iz = 0; iz < sd; iz++) for (let ix = 0; ix < sd; ix++) {
      const i = iz * sd + ix;
      const iL = Math.max(0, ix - 1), iR = Math.min(sd - 1, ix + 1);
      const iD = Math.max(0, iz - 1), iU = Math.min(sd - 1, iz + 1);
      const gx = (HS[iz * sd + iR] - HS[iz * sd + iL]) / ((iR - iL) * st);
      const gz = (HS[iU * sd + ix] - HS[iD * sd + ix]) / ((iU - iD) * st);
      const inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
      na.setXYZ(i, -gx * inv, inv, -gz * inv);
    }
    na.needsUpdate = true;
  }

  if (window.__WG_DIRECT__) {
    // bypass the whole composer: straight forward render to the canvas
    const e = ctx.engine, r = ctx.renderer;
    e.render = function (dt) {
      this.scene.traverse?.(() => {});
      r.setRenderTarget(null);
      r.render(this.scene, this.camera);
    };
  }

  let px, pz, cx, cy, cz, fov = 52, hour = 9.0;
  if (which === 'gate') { px = 22; pz = -6; cx = 22; cy = 120; cz = -330; }
  else if (which === 'close') { px = 0; pz = -250; cx = 0; cy = 80; cz = -400; hour = 12; }
  else { px = -262; pz = 55; cx = -320; cy = 40; cz = 67; hour = 15; fov = 55; }
  ctx.environment?.setTime?.(hour);
  p.position.set(px, 0, pz);
  p._snapToGround?.();
  ctx.vegetation?.forceStream?.(px, pz);
  const y = T.getHeight(px, pz);
  const shot = () => {
    cam.fov = fov; cam.updateProjectionMatrix();
    cam.position.set(px, y + 5.0, pz);
    cam.lookAt(cx, which === 'gate' ? y + cy : cy, cz);
    cam.updateMatrixWorld(true);
  };
  shot();
  setInterval(shot, 8);
  for (let i = 0; i < 4; i++) { ctx.engine._shadowCullClock = 0; ctx.engine.render(0.05); }
  return { mode, which };
})()
