/**
 * M3 area C: the grey hulls as three meshes, from the kinds' own form modules (./forms.mjs). One builder for the line-up
 * page (./lineup.js) and the Sonde's mask proof staging (./sonde-stage-page.mjs): a box is a box, a cylinder a 16-sided
 * cylinder on its axis (a frustum where it has r2), a strut a 10-sided bar, a torus its struts. Three is passed in, so
 * the page's own instance is used.
 */
import { M3_FORMS, expandParts } from './forms.mjs';

export function strutMesh(THREE, a, b, r, sides, material, r2 = r) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, len, sides, 1), material);
  m.position.copy(A).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

/** One grey hull (a Group named for its kind); `matOf(part)` gives each part's material. */
export function buildGreyHull(THREE, kind, matOf) {
  const g = new THREE.Group(); g.name = kind;
  for (const p of expandParts(M3_FORMS[kind].parts)) {
    const material = matOf(p);
    let m;
    if (p.type === 'box') { m = new THREE.Mesh(new THREE.BoxGeometry(...p.s), material); m.position.set(...p.c); }
    else if (p.type === 'cyl') {
      const geo = new THREE.CylinderGeometry(p.r2 ?? p.r, p.r, p.h, 16, 1);
      if (p.axis === 'z') geo.rotateX(Math.PI / 2); else if (p.axis === 'x') geo.rotateZ(-Math.PI / 2);
      m = new THREE.Mesh(geo, material); m.position.set(...p.c);
    } else if (p.type === 'strut') m = strutMesh(THREE, p.a, p.b, p.r, 10, material);
    if (!m) continue;
    m.name = p.name; m.castShadow = !p.lamp; m.receiveShadow = true;
    g.add(m);
  }
  return g;
}
