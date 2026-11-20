import * as THREE from 'three';

/**
 * THE KILN YARDS' GREY STAND-INS (Milestone 3 wave 3; built for area E's "The Kiln Yards", src/game/hour2/kiln-yards.js,
 * which may not import three itself: tools/tier0/imports.mjs). Two Kiln hulls, a Spindle and the plant's quench tank as
 * plain grey boxes and cylinders at the kinds' roster sizes, each Instrument with its one lamp in the three tokens. They
 * stand until area C's live kinds stand at the Yards; nothing here moves them (the quest writes their roots each step).
 *
 *   buildYardsStandins(scene, { kilns, spindle, tank: { x, y, z }, kiln: { L, W, H }, spindleH })
 *     -> { group, kilns: [{ root, lamp }], spindle: { root, ring, lamp } | null, tank, lampHex(lamp, hex), dispose() }
 */
export const STANDIN_COLOURS = Object.freeze({ grey: 0x8b8a84, dark: 0x5d5c58, calm: 0xF2EAD3, wary: 0xB5E61D, hostile: 0xFF2D8C });

export function buildYardsStandins(scene, { kilns = 2, spindle = true, tank = null, kiln = { L: 5.0, W: 3.4, H: 5.5 }, spindleH = 3.8 } = {}) {
  const C = STANDIN_COLOURS;
  const group = new THREE.Group(); group.name = 'kiln-yards-standins';
  const mats = [], geos = [];
  const mat = (c) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0.0 }); mats.push(m); return m; };
  const lampMat = () => { const m = new THREE.MeshBasicMaterial({ color: C.calm }); mats.push(m); return m; };
  const geo = (g) => { geos.push(g); return g; };
  const ks = [];
  for (let i = 0; i < kilns; i++) {
    const root = new THREE.Group(); root.name = `kiln-standin-${i + 1}`;
    const body = new THREE.Mesh(geo(new THREE.BoxGeometry(kiln.W, kiln.H * 0.62, kiln.L)), mat(C.grey));
    body.position.y = kiln.H * 0.31;
    const stack = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.42, 0.55, kiln.H * 0.38, 10)), mat(C.dark));
    stack.position.set(0, kiln.H * 0.81, -0.6);
    const lamp = new THREE.Mesh(geo(new THREE.SphereGeometry(0.16, 10, 8)), lampMat());
    lamp.position.set(0.85, 1.25, kiln.L / 2 + 0.05);
    root.add(body, stack, lamp);
    group.add(root);
    ks.push({ root, lamp });
  }
  let sp = null;
  if (spindle) {
    const root = new THREE.Group(); root.name = 'spindle-standin';
    const post = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.22, 0.35, spindleH, 10)), mat(C.grey));
    post.position.y = spindleH / 2;
    const ring = new THREE.Mesh(geo(new THREE.TorusGeometry(0.94, 0.06, 6, 28)), mat(C.dark));
    ring.position.y = 2.36; ring.rotation.x = Math.PI / 2;
    const lamp = new THREE.Mesh(geo(new THREE.SphereGeometry(0.13, 10, 8)), lampMat());
    lamp.position.set(0.36, 1.47, 0.05);
    root.add(post, ring, lamp);
    group.add(root);
    sp = { root, ring, lamp };
  }
  let tk = null;
  if (tank) {
    tk = new THREE.Mesh(geo(new THREE.CylinderGeometry(1.1, 1.1, 1.2, 14)), mat(C.dark));
    tk.name = 'quench-tank-standin';
    tk.position.set(tank.x, tank.y + 0.6, tank.z);
    group.add(tk);
  }
  scene?.add?.(group);
  return {
    group, kilns: ks, spindle: sp, tank: tk,
    lampHex: (lamp, hex) => { if (lamp?.material?.color && lamp.material.color.getHex() !== hex) lamp.material.color.setHex(hex); },
    dispose: () => { group.removeFromParent(); for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); },
  };
}
