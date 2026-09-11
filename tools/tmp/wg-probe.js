(() => {
  const ctx = __CTX__, cam = ctx.camera, T = ctx.terrain;
  ctx.environment?.setWeather?.('clear', 0);
  ctx.environment?.setTime?.(9.0);
  const p = ctx.player;
  p._updateCamera = () => {};
  if (ctx.studio) ctx.studio.update = () => {};
  p.position.set(22, 0, -6); p._snapToGround?.();
  const y = T.getHeight(22, -6);
  cam.fov = 52; cam.updateProjectionMatrix();
  cam.position.set(22, y + 5.0, -6);
  cam.lookAt(22, y + 120, -330);
  cam.updateMatrixWorld(true);
  const THREE = T.mesh.geometry.constructor.prototype.constructor;
  const rc = new (Object.getPrototypeOf(ctx.scene).constructor.prototype ? window.__THREE_RC__ || Object : Object)();
  const out = { screeCount: T.screeCount, cliffCount: T.cliffCount };
  // raycast a few plaid pixels
  const R = ctx.raycaster || null;
  out.hasRaycaster = !!R;
  const frag = T.mesh.material.__hzcFrag || null;
  out.detStr = String(T.mesh.material.userData && T.mesh.material.userData.x);
  return out;
})()
