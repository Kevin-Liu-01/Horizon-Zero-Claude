import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchAerial, patchDeck } from './aerial.js';

/**
 * THE KILN YARDS' FAR FORM (M2 wave 4, area A, HG6; bible §3 Malpais: "the Kiln Yards: ruined geothermal plant: two
 * tiled cooling-tower stubs 22-28 m, 3-5 flue stacks, pipe racks, glowing man-made wellheads"). Seen from the Malpais
 * edge where "True Ground" ends, 100 m off, and from the Holds' east slopes: a form to read at range, not a place to
 * walk yet (no colliders: the hour never goes there; a later milestone builds the Yards as a site).
 *
 *   const ky = buildKilnYards({ x, z, ground })   ky.group (two draws: the ruin, the wellheads' glow) · ky.counts · dispose()
 *
 * The ruin is one merged mesh with vertex colours (weathered tile on the towers, rust brick on the stacks, grey steel on
 * the racks); the only light is the wellheads' caps, bone-gold (#F2EAD3), never a lava's orange: zero emissive ground.
 */
/* M2 fix wave (HG6: "lit like the rest"): the ruin's albedo in the island's own range. At fa45e47 its tile was linear 0.26
 * (0x8d918a) under the exposure the black lapilli are lit for (linear 0.02-0.07): in trade at noon the towers drew 208/255
 * against the lit lapilli's 97, flat white with no lit or shaded side, and in calima the 12 % of them the dust lets
 * through still stood paler than the dust (exit run F45, F45-trade). Weathered tile now linear 0.09 to 0.04, brick and
 * steel under it, the wellheads' bodies darkest: the same family as the Holds' basalt (0.022-0.068) and their lime */
const TILE = new THREE.Color(0x55574f), TILE_DARK = new THREE.Color(0x3a3b37), BRICK = new THREE.Color(0x4a3026),
  BRICK_SOOT = new THREE.Color(0x221d1b), STEEL = new THREE.Color(0x3d3f40), HEAD = new THREE.Color(0x2f2c2a);
const GLOW = 0xf2ead3;

/** Two tower stubs, four stacks, three racks, three wellheads: offsets (m) from the Yards' centre, engine x/z. */
export const KILN_LAYOUT = Object.freeze({
  towers: Object.freeze([{ dx: 14, dz: -18, r0: 11, r1: 7.6, h: 26 }, { dx: -17, dz: -5, r0: 9.6, r1: 6.8, h: 22.5 }]),
  stacks: Object.freeze([{ dx: 4, dz: 13, r: 1.25, h: 29 }, { dx: -5, dz: 20, r: 1.05, h: 21 }, { dx: 21, dz: 9, r: 1.15, h: 25 }, { dx: 29, dz: 23, r: 0.95, h: 18 }]),
  racks: Object.freeze([{ ax: -10, az: 8, bx: 22, bz: 14 }, { ax: 4, az: 13, bx: 9, bz: -10 }, { ax: 21, az: 9, bx: 29, bz: 23 }]),
  wells: Object.freeze([{ dx: 7, dz: 9 }, { dx: 12, dz: 4 }, { dx: -2, dz: 12 }]),
});

function paint(geo, colorAt) {
  const p = geo.attributes.position, n = p.count, c = new Float32Array(n * 3), col = new THREE.Color();
  for (let i = 0; i < n; i++) { colorAt(p.getX(i), p.getY(i), p.getZ(i), col); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

/** A cooling-tower stub: a hyperboloid shell broken off on a ragged line, its tiles in courses. */
function towerStub({ r0, r1, h }, seed) {
  const pts = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N, y = t * h;
    // the waist sits above the stub's top (a stub is the lower part of the shell): it narrows all the way up
    const r = r1 + (r0 - r1) * Math.pow(1 - t, 1.6);
    pts.push(new THREE.Vector2(r, y));
  }
  const geo = new THREE.LatheGeometry(pts, 28);
  // the broken rim: the top rows pulled down by a ragged amount round the ring
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < h * 0.7) continue;
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const bite = (Math.sin(a * 3 + seed) * 0.5 + 0.5) * 0.22 + (Math.sin(a * 7.3 + seed * 2.1) * 0.5 + 0.5) * 0.10;
    p.setY(i, Math.min(y, h * (1 - bite)));
  }
  geo.computeVertexNormals();
  return paint(geo, (x, y, z, c) => {
    const course = Math.floor(y / 1.1) % 2, streak = Math.sin(Math.atan2(z, x) * 11 + seed) * 0.5 + 0.5;
    c.copy(TILE).lerp(TILE_DARK, 0.25 * course + 0.45 * streak * (1 - y / h));
  });
}

function stack({ r, h }) {
  const geo = new THREE.CylinderGeometry(r * 0.82, r, h, 10, 4, true);
  geo.translate(0, h / 2, 0);
  return paint(geo, (x, y, z, c) => { c.copy(BRICK).lerp(BRICK_SOOT, THREE.MathUtils.smoothstep(y / h, 0.7, 1.0)); });
}

function rack({ ax, az, bx, bz }) {
  const L = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax);
  const parts = [];
  const pipe = new THREE.CylinderGeometry(0.35, 0.35, L, 6, 1, true);
  pipe.rotateZ(Math.PI / 2);
  for (const [oy, oz] of [[4.2, -0.5], [4.2, 0.5], [4.9, 0]]) { const g = pipe.clone(); g.translate(L / 2, oy, oz); parts.push(g); }
  const posts = Math.max(2, Math.round(L / 7));
  for (let i = 0; i <= posts; i++) { const g = new THREE.BoxGeometry(0.35, 4.4, 1.6); g.translate((i / posts) * L, 2.2, 0); parts.push(g); }
  const geo = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  geo.rotateY(-ang);
  geo.translate(ax, 0, az);
  return paint(geo, (x, y, z, c) => c.copy(STEEL));
}

export function buildKilnYards({ x, z, ground = () => 0 }) {
  const L = KILN_LAYOUT, parts = [], glow = [];
  const at = (g, dx, dz, sink = 0.6) => { g.translate(x + dx, ground(x + dx, z + dz) - sink, z + dz); return g; };
  L.towers.forEach((t, i) => parts.push(at(towerStub(t, i * 1.7 + 0.4).toNonIndexed(), t.dx, t.dz, 1.2)));
  L.stacks.forEach((s) => parts.push(at(stack(s).toNonIndexed(), s.dx, s.dz)));
  // a rack's ends stand on the ground under each end (the average: the far form does not bend)
  L.racks.forEach((r) => {
    const g = rack({ ax: 0, az: 0, bx: r.bx - r.ax, bz: r.bz - r.az });
    const y = (ground(x + r.ax, z + r.az) + ground(x + r.bx, z + r.bz)) / 2;
    g.translate(x + r.ax, y - 0.3, z + r.az);
    parts.push(g);
  });
  L.wells.forEach((w) => {
    const body = paint(new THREE.CylinderGeometry(0.75, 0.95, 1.6, 10), (a, b, c2, c) => c.copy(HEAD));
    body.translate(0, 0.8, 0);
    parts.push(at(body.toNonIndexed(), w.dx, w.dz, 0.1));
    const cap = new THREE.TorusGeometry(0.62, 0.12, 6, 14);
    cap.rotateX(Math.PI / 2);
    cap.translate(0, 1.62, 0);
    glow.push(at(cap, w.dx, w.dz, 0.1));
  });
  const ruinGeo = mergeGeometries(parts);
  ruinGeo.computeBoundingSphere();
  const ruinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0.0 });
  ruinMat.name = 'kiln-yards';
  const ruin = new THREE.Mesh(ruinGeo, ruinMat);
  ruin.name = 'kiln-yards-ruin';
  ruin.castShadow = false; ruin.receiveShadow = true;
  const glowGeo = mergeGeometries(glow.map((g) => g.toNonIndexed()));
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x1a1816, emissive: GLOW, emissiveIntensity: 2.2, roughness: 0.6 });
  glowMat.name = 'kiln-yards-wellheads';
  const caps = new THREE.Mesh(glowGeo, glowMat);
  caps.name = 'kiln-yards-wellheads';
  caps.castShadow = false; caps.receiveShadow = false;
  /* M2 fix wave (HG6, "fogged like the rest"): the air of the island's far forms, as the ground takes it (terrain.js: the
   * far-form air, island/aerial.js, and the trade deck's optical depth capped by DECK). The Yards stand at 142 m, inside
   * the deck's slab (105-150 m), and drew the deck uncapped: at 94f7cc8 their pixels read the same with the sun off and
   * with the albedo a third of what it was (F45-trade Y 209 against the sky's 187, F45 186 against the dust's 165, run
   * 20261119T213014Z-94f7cc8-world-f45-94f7cc8-partial-x2): cloud-sea colour, not a lit ruin. The probe's kilnYards read */
  for (const [m, key] of [[ruinMat, 'cal-kiln-yards'], [glowMat, 'cal-kiln-yards-glow']]) {
    m.onBeforeCompile = (shader) => { patchAerial(shader); patchDeck(shader); };
    m.customProgramCacheKey = () => key;
  }
  const group = new THREE.Group();
  group.name = 'kiln-yards';
  group.add(ruin, caps);
  for (const g of [...parts, ...glow]) g.dispose?.();
  const tri = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  return {
    group,
    counts: { towers: L.towers.length, stacks: L.stacks.length, racks: L.racks.length, wellheads: L.wells.length, triangles: Math.round(tri(ruinGeo) + tri(glowGeo)), draws: 2 },
    materials: [ruinMat, glowMat],
    dispose() { ruinGeo.dispose(); glowGeo.dispose(); ruinMat.dispose(); glowMat.dispose(); group.parent?.remove(group); },
  };
}
