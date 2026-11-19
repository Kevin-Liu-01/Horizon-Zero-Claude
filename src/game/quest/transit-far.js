import * as THREE from 'three';

/**
 * THE TRANSIT'S FAR FORM, A SYSTEMS STAND-IN (Milestone 2 wave 4, area E; bible 11.2 0:55, HR6, EN4). "True Ground"'s last
 * beat reads what walks on the Malpais rim at noon in calima: `TRANSIT · BASELINE · STATION 1 OF 9`. The far form is
 * area C's (instruments) and sky-look's; until one is published (`ctx.transitFar`, or a live machine of kind 'transit')
 * this stands in for it, named as a stand-in in the runner's report, so the beat can be read at all:
 *   three pale splayed legs to a head at 15 m and the drum of its glass across them, matte, with one calm lamp
 *   (bone-gold #F2EAD3, the lamp rule), no emissive surface but the lamp, no shadow, the scene's fog over it.
 * It is drawn only inside the beat's window (EN4: "not drawn outside the beat's window"): `show(on)` each frame.
 *
 *   const far = buildTransitStandIn({ x, z, ground, facing })   far.group · far.head (Vector3, the read point) · show(on) · dispose()
 */
export const TRANSIT_HEAD_M = 15;
const LEG_M = 16.2;
const SPLAY = 0.42;   // radians off the vertical

export function buildTransitStandIn({ x, z, ground = () => 0, facing = 0 }) {
  const g = new THREE.Group();
  g.name = 'transit-far-standin';
  const y0 = ground(x, z);
  g.position.set(x, y0, z);
  g.rotation.y = facing;
  const pale = new THREE.MeshStandardMaterial({ color: 0xcfc9bb, roughness: 0.92, metalness: 0.0 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x8c7a58, roughness: 0.6, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xc6dcd8, roughness: 0.2, metalness: 0.1 });
  const lampM = new THREE.MeshStandardMaterial({ color: 0x2a2620, emissive: 0xf2ead3, emissiveIntensity: 1.6, roughness: 0.5 });
  const legGeo = new THREE.CylinderGeometry(0.16, 0.32, LEG_M, 7, 1);
  legGeo.translate(0, -LEG_M / 2, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(legGeo, pale);
    leg.position.set(0, TRANSIT_HEAD_M, 0);
    // splayed outward on its bearing
    leg.rotation.set(Math.cos(a) * SPLAY, 0, -Math.sin(a) * SPLAY);
    g.add(leg);
  }
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.45, 12), brass);
  plate.position.y = TRANSIT_HEAD_M + 0.2;
  g.add(plate);
  const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.6, 1.9), pale);
  yoke.position.y = TRANSIT_HEAD_M + 1.2;
  g.add(yoke);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 3.2, 12), pale);
  drum.rotation.z = Math.PI / 2;
  drum.position.y = TRANSIT_HEAD_M + 1.9;
  g.add(drum);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.5, 14), glass);
  lens.position.set(1.61, TRANSIT_HEAD_M + 1.9, 0);
  lens.rotation.y = Math.PI / 2;
  g.add(lens);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lampM);
  lamp.position.set(0, TRANSIT_HEAD_M + 2.7, 0);
  g.add(lamp);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  g.visible = false;
  const head = new THREE.Vector3(x, y0 + TRANSIT_HEAD_M + 1.9, z);
  return {
    group: g,
    head,
    standIn: true,
    show(on) { g.visible = !!on; },
    dispose() {
      g.removeFromParent();
      const seen = new Set();
      g.traverse((o) => { if (o.isMesh) { if (!seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); } } });
      for (const m of [pale, brass, glass, lampM]) m.dispose();
    },
  };
}
