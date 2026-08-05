import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glowTexture } from './machine.js';

/**
 * Procedural machine component meshes (spec v2 parts contract).
 * All factories return a THREE.Group authored in METERS with +Y = "outward"
 * (the axis addPart aligns to the hull normal) unless noted. Materials are
 * created per call so torn parts can be tinted/disposed independently.
 * PBR metal + emissive accents so add-ons read as machine tech, not props.
 *
 * Perf rules (draw-call budget):
 * - same-material sub-shapes are merged into ONE geometry per factory
 * - part meshes NEVER cast shadows, except the two Thunderjaw disc
 *   launchers (the signature pickup must ground itself visually)
 * - materials with `userData.sensor = true` are picked up by Machine.addPart
 *   and driven by the eye-state system (blue/yellow/red + telegraph flash,
 *   dark on death); other emissives stay identity-colored but die on death.
 */

/** Explicit no-shadow pass for part meshes (perf: shadow pass draw calls). */
function noShadows(g) {
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}

export function metalMat(color = 0x8f96a3, rough = 0.38, metalness = 0.85) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness: rough });
}

export function emissiveMat(color, intensity = 1.8, base = 0x14161a) {
  return new THREE.MeshStandardMaterial({
    color: base, emissive: new THREE.Color(color), emissiveIntensity: intensity,
    metalness: 0.3, roughness: 0.4,
  });
}

/** Soft additive glow sprite (FX only — never a hitbox). */
export function glowSprite(color, scale, opacity = 0.4) {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(scale);
  s.raycast = () => {};
  return s;
}

/** Drives the faint canister/loader glow pulse. Call from part.update. */
export function pulseGlow(group, t, speed = 4) {
  const cm = group.userData.coreMat;
  const gm = group.userData.glowMat;
  const k = 0.5 + 0.5 * Math.sin(t * speed + (group.userData.pulseSeed ?? 0));
  if (cm) cm.emissiveIntensity = 1.7 + k * 1.2;
  if (gm) gm.opacity = 0.24 + k * 0.15;
}

/**
 * Elemental canister: caged emissive cylinder (blaze orange / freeze cyan).
 * Authored upright along +Y.
 */
export function canisterMesh({ color = 0xff7a1e, r = 0.21, h = 0.6, shell = 0x9aa0a8 } = {}) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.8, r * 0.8, h * 0.76, 12),
    emissiveMat(color, 1.5),
  );
  g.add(core);
  // caps + struts share one metal material -> merge into a single cage mesh
  const cageGeos = [
    new THREE.CylinderGeometry(r, r * 1.04, h * 0.16, 12).translate(0, h * 0.42, 0),
    new THREE.CylinderGeometry(r, r * 1.04, h * 0.16, 12).rotateZ(Math.PI).translate(0, -h * 0.42, 0),
  ];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    cageGeos.push(new THREE.BoxGeometry(0.05, h * 0.86, 0.07)
      .rotateY(-a).translate(Math.cos(a) * r * 0.95, 0, Math.sin(a) * r * 0.95));
  }
  g.add(new THREE.Mesh(mergeGeometries(cageGeos), metalMat(shell, 0.34)));
  // no glow sprite: the pulsing emissive core + bloom carry the aim-marker
  // read (draw-call budget)
  g.userData.coreMat = core.material;
  g.userData.pulseSeed = Math.random() * 7;
  return noShadows(g);
}

/** Hex armor plate lying in the XZ plane (+Y = outward normal). */
export function plateMesh({ w = 0.7, l = 0.9, t = 0.1, color = 0xd6dade, trim = 0x2e3339 } = {}) {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, t, 6), metalMat(color, 0.46, 0.7));
  plate.scale.set(w, 1, l);
  g.add(plate);
  // recessed under-frame hints at machine guts below the plate
  const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.5, t * 0.6, 6), metalMat(trim, 0.6, 0.5));
  frame.position.y = -t * 0.5;
  frame.scale.set(w, 1, l);
  g.add(frame);
  return noShadows(g);
}

/** Thin sensor antenna with a state-colored tip light. Authored up along +Y. */
export function antennaMesh({ len = 0.65, color = 0x565c64, tip = 0x38c6ff } = {}) {
  const g = new THREE.Group();
  // base + rod: one metal material, merged
  const rodGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.06, 0.09, 0.12, 8).translate(0, 0.05, 0),
    new THREE.CylinderGeometry(0.018, 0.032, len, 6).translate(0, 0.1 + len / 2, 0),
  ]);
  g.add(new THREE.Mesh(rodGeo, metalMat(color, 0.35)));
  // tip is a SENSOR light: follows machine eye state, dies on death
  const tipM = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 6), emissiveMat(tip, 2.4));
  tipM.material.userData.sensor = true;
  tipM.position.y = 0.12 + len;
  g.add(tipM);
  return noShadows(g);
}

/**
 * Watcher eye lens (research 0.4/1.2: the eye IS the character). A large
 * emissive iris ball — SENSOR-tagged so it burns with the exact state color
 * (blue/yellow/red + white-hot telegraph, dark on death) — in a metal rim.
 * Weak part, not tearable.
 */
export function lensMesh({ r = 0.26 } = {}) {
  const g = new THREE.Group();
  const iris = new THREE.Mesh(
    new THREE.SphereGeometry(r, 14, 12),
    emissiveMat(0x38c6ff, 2.1, 0x06090c),
  );
  iris.material.userData.sensor = true;
  g.add(iris);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 1.0, r * 0.18, 6, 18), metalMat(0x9aa0a8, 0.3));
  g.add(rim);
  return noShadows(g);
}

/** Behemoth anti-gravity Force Loader: metal ring + purple-blue emissive disc (+Y out). */
export function forceLoaderMesh({ r = 0.4, color = 0x8f7bff } = {}) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.24, 8, 20), metalMat(0x6d7580, 0.4));
  ring.rotation.x = Math.PI / 2; // lie in XZ, axis +Y
  ring.position.y = 0.06;
  g.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.86, 20), emissiveMat(color, 2.4));
  disc.material.side = THREE.DoubleSide;
  disc.rotation.x = -Math.PI / 2; // face +Y
  disc.position.y = 0.1;
  g.add(disc);
  const glow = glowSprite(color, r * 4, 0.32);
  glow.position.y = 0.15;
  g.add(glow);
  g.userData.coreMat = disc.material;
  g.userData.glowMat = glow.material;
  g.userData.pulseSeed = Math.random() * 7;
  return noShadows(g);
}

/** Thunderjaw back Radar: base + pole + rotating fin (userData.fin). Upright. */
export function radarMesh({ accent = 0x9fd8ff } = {}) {
  const g = new THREE.Group();
  // base + pole: one metal material, merged
  const mastGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.3, 0.44, 0.3, 10).translate(0, 0.15, 0),
    new THREE.CylinderGeometry(0.08, 0.11, 0.85, 8).translate(0, 0.7, 0),
  ]);
  g.add(new THREE.Mesh(mastGeo, metalMat(0x5a616b, 0.42)));
  const fin = new THREE.Group();
  fin.position.y = 1.15;
  g.add(fin);
  const dish = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.52, 0.07), metalMat(0xaab2bc, 0.35));
  g.userData.dish = dish;
  fin.add(dish);
  // sweep strip is a SENSOR: state-colored, dies out on death
  const strip = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.08, 0.09), emissiveMat(accent, 2.2));
  strip.material.userData.sensor = true;
  strip.position.y = 0.3;
  fin.add(strip);
  g.userData.fin = fin;
  return noShadows(g);
}

/** Thunderjaw Disc Launcher: boxy turret w/ 3 stacked barrels + emissive vents. Upright, barrels +Z.
 *  The ONLY part that casts shadows (signature pickup must sit visually). */
export function discLauncherMesh({ accent = 0x8fd8ff } = {}) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.62, 1.5), metalMat(0x7d8590, 0.42));
  body.position.y = 0.34;
  g.add(body);
  // 3 barrels: one material, merged
  const barrelGeos = [];
  for (let i = 0; i < 3; i++) {
    barrelGeos.push(new THREE.CylinderGeometry(0.11, 0.13, 0.55, 10)
      .rotateX(Math.PI / 2).translate(0, 0.16 + i * 0.24, 0.85));
  }
  const barrels = new THREE.Mesh(mergeGeometries(barrelGeos), metalMat(0x3d434b, 0.35));
  g.add(barrels);
  const vent = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.09, 0.9), emissiveMat(accent, 1.8));
  vent.position.set(0, 0.66, -0.15);
  g.add(vent);
  const glow = glowSprite(accent, 0.8, 0.22);
  glow.position.set(0, 0.66, -0.15);
  g.add(glow);
  g.userData.coreMat = vent.material;
  g.userData.glowMat = glow.material;
  g.userData.pulseSeed = Math.random() * 7;
  noShadows(g);
  body.castShadow = true;
  barrels.castShadow = true;
  return g;
}

/** Thunderjaw mandibular cannon: mount + tapered barrel (+Z), emissive muzzle. */
export function cannonMesh({ accent = 0xffb36b } = {}) {
  const g = new THREE.Group();
  const bodyGeo = mergeGeometries([
    new THREE.BoxGeometry(0.34, 0.4, 0.55).translate(0, 0.04, -0.32),
    new THREE.CylinderGeometry(0.11, 0.16, 1.2, 10).rotateX(Math.PI / 2).translate(0, 0.08, 0.38),
    new THREE.CylinderGeometry(0.2, 0.2, 0.24, 10).rotateX(Math.PI / 2).translate(0, 0.08, -0.02),
  ]);
  g.add(new THREE.Mesh(bodyGeo, metalMat(0x7d8590, 0.4)));
  const muzzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 0.12, 10).rotateX(Math.PI / 2),
    emissiveMat(accent, 1.6),
  );
  muzzle.position.set(0, 0.08, 0.99);
  g.add(muzzle);
  g.userData.muzzle = muzzle; // tracer origin
  return noShadows(g);
}

/** Power cell: small caged emissive box (shock detonation -> self-stun). */
export function powerCellMesh({ color = 0xffd23d } = {}) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.4), emissiveMat(color, 1.6));
  core.position.y = 0.18;
  g.add(core);
  const frameGeo = mergeGeometries([
    new THREE.BoxGeometry(0.36, 0.1, 0.52).translate(0, 0.02, 0),
    new THREE.BoxGeometry(0.36, 0.09, 0.1).translate(0, 0.34, -0.18),
    new THREE.BoxGeometry(0.36, 0.09, 0.1).translate(0, 0.34, 0.18),
  ]);
  g.add(new THREE.Mesh(frameGeo, metalMat(0x6d7580, 0.4)));
  // no glow sprite (draw-call budget): emissive core + bloom do the work
  g.userData.coreMat = core.material;
  g.userData.pulseSeed = Math.random() * 7;
  return noShadows(g);
}

/** Exposed inner core (heart/nexus) revealed when its armor plate is torn. */
export function coreMesh({ color = 0xff9a3d, r = 0.32 } = {}) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), emissiveMat(color, 2.6, 0x1a120a));
  g.add(core);
  const glow = glowSprite(color, r * 4.5, 0.4);
  g.add(glow);
  g.userData.coreMat = core.material;
  g.userData.glowMat = glow.material;
  g.userData.pulseSeed = Math.random() * 7;
  return noShadows(g);
}

/** Behemoth belly Cargo Hold: banded ochre drum, slotted vertically. */
export function cargoMesh() {
  const g = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 1.5, 12), metalMat(0xb08a52, 0.55, 0.55));
  g.add(drum);
  // both retaining bands: one material, merged
  const bandGeo = mergeGeometries([
    new THREE.TorusGeometry(0.585, 0.05, 6, 16).rotateX(Math.PI / 2).translate(0, -0.5, 0),
    new THREE.TorusGeometry(0.585, 0.05, 6, 16).rotateX(Math.PI / 2).translate(0, 0.5, 0),
  ]);
  g.add(new THREE.Mesh(bandGeo, metalMat(0x5c636b, 0.4)));
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 0.04), emissiveMat(0xffc23d, 1.4));
  seam.position.z = 0.57;
  g.add(seam);
  return noShadows(g);
}

/** Thunderjaw tail-tip: bladed counterweight spike, tip pointing -Z (rearward). */
export function tailTipMesh() {
  const g = new THREE.Group();
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.7, 8), metalMat(0x7d8590, 0.4));
  spike.rotation.x = -Math.PI / 2; // +Y -> -Z
  spike.position.z = -0.6;
  g.add(spike);
  // both fins: one material, merged
  const finGeos = [];
  for (const side of [1, -1]) {
    finGeos.push(new THREE.BoxGeometry(0.06, 0.62, 0.9)
      .rotateZ(side * 0.35).translate(side * 0.22, 0.1, 0.15));
  }
  g.add(new THREE.Mesh(mergeGeometries(finGeos), metalMat(0xaab2bc, 0.36)));
  // tail light is a SENSOR: state-colored, dies out on death
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), emissiveMat(0xff5a3c, 2));
  light.material.userData.sensor = true;
  light.position.z = -1.35;
  g.add(light);
  return noShadows(g);
}

/** Gravity boulder for the Behemoth's force-loader attacks. Single mesh. */
export function rockMesh(r = 0.6) {
  const geo = new THREE.DodecahedronGeometry(r, 0);
  // jitter vertices so the rock reads hand-hewn, not platonic
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) * (0.85 + Math.random() * 0.3),
      pos.getY(i) * (0.85 + Math.random() * 0.3),
      pos.getZ(i) * (0.85 + Math.random() * 0.3),
    );
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.95, metalness: 0.02 }),
  );
}
