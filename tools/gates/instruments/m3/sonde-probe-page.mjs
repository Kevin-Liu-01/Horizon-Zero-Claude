/**
 * M3 area C, wave 2: the Sonde mask proof's probe, run by `film.mjs --probe /tools/gates/instruments/m3/sonde-probe-page.mjs`
 * after each shot on the frozen frame. Reads only. Returns the lens exactly as drawn (tools/world/camera-probe-page.mjs's
 * record: matrixWorld, projection, fov, aspect), the direction TOWARD whatever lights the world (environment.lightDir:
 * the sun, or the moon at night; the Sonde's shadow falls away from it) and, when the proof staging installed the Sonde
 * (./sonde-stage-page.mjs), what it installed and every vertex of it projected to the frame (CSS px), so the Node half
 * (./sonde-mask.mjs) can check that the drawn Sonde lies inside its mask.
 */
export function probe(f) {
  const C = window.__CTX__, cam = C?.camera, env = C?.environment;
  if (!cam) return { error: 'no camera' };
  cam.updateMatrixWorld(true);
  const r6 = (v) => Math.round(v * 1e6) / 1e6;
  const cv = C.engine?.renderer?.domElement;
  const out = {
    id: f.id, repeat: f._repeat || 1,
    fov: cam.fov, aspect: cam.aspect, near: cam.near, far: cam.far,
    position: [cam.position.x, cam.position.y, cam.position.z].map(r6),
    quaternion: [cam.quaternion.x, cam.quaternion.y, cam.quaternion.z, cam.quaternion.w].map(r6),
    matrixWorld: Array.from(cam.matrixWorld.elements).map(r6),
    projection: Array.from(cam.projectionMatrix.elements).map(r6),
    view: { width: innerWidth, height: innerHeight, canvasW: cv?.width ?? null, canvasH: cv?.height ?? null },
    lightDir: env?.lightDir ? env.lightDir.toArray().map(r6) : null,
    sunDir: env?.sunDir ? env.sunDir.toArray().map(r6) : null,
    sunAltitudeDeg: env?.sunAltitudeDeg ?? null,
  };
  const S = window.__SONDE_PROOF__;
  if (S) {
    const root = C.scene.getObjectByName('m3c-sonde-proof');
    const pts = [];
    if (root) {
      root.updateMatrixWorld(true);
      const v = cam.position.clone();
      root.traverse((o) => {
        if (!o.isMesh) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).project(cam);
          if (v.z < -1 || v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
          pts.push([Math.round((v.x + 1) / 2 * innerWidth), Math.round((1 - v.y) / 2 * innerHeight)]);
        }
      });
    }
    out.sonde = { ...S, projectedVertices: pts.length, projected: pts };
  }
  return out;
}
