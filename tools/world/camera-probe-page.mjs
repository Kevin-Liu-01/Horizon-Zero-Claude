/**
 * The skyline masks' camera probe (area A, M2 wave 1): run by `film.mjs --probe /tools/world/camera-probe-page.mjs`
 * after each shot, on the frozen frame. It returns the lens exactly as the frame was drawn (its world matrix, its
 * projection, the drawing buffer's aspect), so tools/world/skyline-masks.mjs can cast the frame's rays in Node.
 * Reads only; changes nothing.
 */
export function probe(f) {
  const C = window.__CTX__, cam = C?.camera;
  if (!cam) return { error: 'no camera' };
  cam.updateMatrixWorld(true);
  const r6 = (v) => Math.round(v * 1e6) / 1e6;
  const cv = C.engine?.renderer?.domElement;
  return {
    id: f.id,
    fov: cam.fov, aspect: cam.aspect, near: cam.near, far: cam.far,
    position: [cam.position.x, cam.position.y, cam.position.z].map(r6),
    quaternion: [cam.quaternion.x, cam.quaternion.y, cam.quaternion.z, cam.quaternion.w].map(r6),
    matrixWorld: Array.from(cam.matrixWorld.elements).map(r6),
    projection: Array.from(cam.projectionMatrix.elements).map(r6),
    view: { width: innerWidth, height: innerHeight, canvasW: cv?.width ?? null, canvasH: cv?.height ?? null },
  };
}
