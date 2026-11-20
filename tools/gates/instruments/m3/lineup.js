/**
 * M3 wave 1, area C (wave 2: the second page, `&wave=2` adds each form's one-line note of what changed: forms.mjs
 * WAVE2_NOTES): THE GREY LINE-UP (owner question Q3's default: "four grey silhouettes beside Brea at wave 1,
 * before any surface work"). One page, no world and no game systems: Brea (her GLB, at her 1.72 m body) and the four
 * grey hulls built in the browser from the kinds' own form modules (./forms.mjs; the same parts the grey recipe
 * tools/build/instruments/gen-m3-blockout.mjs writes), a graduated height staff, studio light.
 *
 *   /tools/gates/instruments/m3/lineup.html?view=front|side|quarter|sonde[&sil=1]
 *     front    every hull facing the lens            side     every hull turned 90 deg (its length across the frame)
 *     quarter  every hull turned 35 deg                sonde    the Sonde on its taut 18 m tether over its post, Brea at
 *                                                               the post, the lens 12 m back (F23-sonde's staging)
 *     sil=1    flat dark silhouettes on a pale ground (the read Q3 asks for)
 *
 * `window.__LINEUP__` = { ready, error, view, measured: { brea: { H }, kiln: { H, W, L }, ... } } (world bounding boxes:
 * Brea's skinned mesh in its pose, each hull's meshes at its yaw 0 before the view turns it).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { configureKTX2, ktx2Loader } from '../../../../src/core/ktx2.js';
import { WAVE2_NOTES } from './forms.mjs';
import { buildGreyHull, strutMesh as greyStrut } from './grey-mesh.mjs';
import { SONDE_KEEL, SONDE_POST, SONDE_TETHER } from '../../../../src/instruments/kinds/sonde/form.js';
import { SondeBrain, downwind } from '../../../../src/instruments/kinds/sonde/rules.js';

const q = new URLSearchParams(location.search);
const VIEW = q.get('view') || 'front';
const SIL = q.get('sil') === '1';
const WAVE = q.get('wave') || '1';
const LU = window.__LINEUP__ = { ready: false, error: null, view: VIEW, sil: SIL, wave: WAVE, measured: {} };
if (SIL) document.body.classList.add('sil');

/** Calm lamp (bible §7.3) and the greys of the recipe (gen-m3-blockout.mjs GREY). */
const CALM = 0xf2ead3;
const GREY = { hull: 0xa9a7a2, joint: 0x6d6c69, brass: 0x8f8a7a, dark: 0x3a3936, glass: 0xd6f0ee };

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = SIL ? THREE.NoToneMapping : THREE.AgXToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = !SIL;
document.body.appendChild(renderer.domElement);
configureKTX2(renderer);

const scene = new THREE.Scene();
scene.background = new THREE.Color(SIL ? 0xe9e5dc : 0x8f8a84);
if (!SIL) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  const key = new THREE.DirectionalLight(0xfff1e0, 2.2); key.position.set(14, 22, 26); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -30, right: 30, top: 30, bottom: -10, near: 1, far: 120 });
  key.target.position.set(9, 0, 0); scene.add(key.target);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 1.2); rim.position.set(-12, 14, -20);
  scene.add(key, rim);
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: SIL ? 0xe9e5dc : 0x77726c, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
if (SIL) floor.material = new THREE.MeshBasicMaterial({ color: 0xe9e5dc });
scene.add(floor);

const SILMAT = new THREE.MeshBasicMaterial({ color: 0x2b2926 });
/** Brea as a flat graphite scale figure: the body GLB alone carries no outfit (the game binds it), so it is not shown dressed here. */
const FIGURE = new THREE.MeshStandardMaterial({ color: 0x4a4642, roughness: 0.8 });
const mats = new Map();
function mat(p) {
  if (SIL) return SILMAT;
  const key = p.lamp ? 'lamp' : p.dark ? 'dark' : p.vial ? 'glass' : p.tone || 'hull';
  if (!mats.has(key)) {
    let m;
    if (key === 'lamp') m = new THREE.MeshBasicMaterial({ color: CALM, toneMapped: false });
    else if (key === 'glass') m = new THREE.MeshStandardMaterial({ color: GREY.glass, roughness: 0.15, metalness: 0 });
    else m = new THREE.MeshStandardMaterial({ color: GREY[key] ?? GREY.hull, roughness: key === 'brass' ? 0.45 : 0.7, metalness: key === 'brass' ? 0.3 : 0 });
    mats.set(key, m);
  }
  return mats.get(key);
}

const strutMesh = (a, b, r, sides, material, r2 = r) => greyStrut(THREE, a, b, r, sides, material, r2);
/** One grey hull from its form's parts (./grey-mesh.mjs: the recipe's own shapes). */
const buildHull = (kind) => buildGreyHull(THREE, kind, mat);

function boxOf(obj) {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj, true), s = b.getSize(new THREE.Vector3());
  return { H: +b.max.y.toFixed(3), W: +s.x.toFixed(3), L: +s.z.toFixed(3), minY: +b.min.y.toFixed(3) };
}

/** A banded line from a to b (1 m bands, vermilion and staff-white: the family mark as flat ink). */
function tether(a, b) {
  const g = new THREE.Group(), A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
  const n = Math.max(1, Math.round(L / SONDE_TETHER.bandM));
  const cols = SONDE_TETHER.colours.map((c) => (SIL ? SILMAT : new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.8 })));
  for (let i = 0; i < n; i++) {
    const p0 = A.clone().addScaledVector(d, i / n), p1 = A.clone().addScaledVector(d, (i + 1) / n);
    g.add(strutMesh(p0.toArray(), p1.toArray(), Math.max(SONDE_TETHER.r, SIL ? 0.04 : 0.03), 8, cols[i % 2]));
  }
  return g;
}
function post(x, z) {
  const g = new THREE.Group();
  const m = SIL ? SILMAT : mat({ tone: 'joint' });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(SONDE_POST.base, SONDE_POST.base, 0.12, 16), m); base.position.set(x, 0.06, z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(SONDE_POST.r, SONDE_POST.r, SONDE_POST.h, 12), m); pole.position.set(x, SONDE_POST.h / 2, z);
  g.add(base, pole);
  return g;
}

/** A graduated staff for scale: 0-6 m, 0.5 m bands (no labels on it; the page's tags carry the numbers). */
function staff(x, z) {
  const g = new THREE.Group();
  const a = SIL ? SILMAT : new THREE.MeshStandardMaterial({ color: 0xd2452e, roughness: 0.8 }), b = SIL ? SILMAT : new THREE.MeshStandardMaterial({ color: 0xe6dcc8, roughness: 0.8 });
  for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), i % 2 ? b : a); m.position.set(x, 0.25 + i * 0.5, z); g.add(m); }
  return g;
}

const camera = new THREE.PerspectiveCamera(20, window.innerWidth / window.innerHeight, 0.1, 500);
const tags = [];
function tag(text, sub, at) { const el = document.createElement('div'); el.className = 'tag'; el.innerHTML = `${text}<small>${sub}</small>`; document.body.appendChild(el); tags.push({ el, at: new THREE.Vector3(...at) }); }
function placeTags() {
  for (const t of tags) {
    const p = t.at.clone().project(camera);
    t.el.style.left = `${((p.x + 1) / 2) * window.innerWidth}px`; t.el.style.top = `${((1 - p.y) / 2) * window.innerHeight}px`;
  }
}

async function loadBrea() {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.setKTX2Loader(ktx2Loader());
  const gltf = await loader.loadAsync('/models/hero/brea.glb');
  const root = gltf.scene;
  const ex = gltf.parser?.json?.asset?.extras?.r5Hero || {};
  root.scale.setScalar(ex.scale ?? 1);
  root.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.material = SIL ? SILMAT : FIGURE; }
    if (o.isBone && /^upperarm_[lr]$/.test(o.name)) o.userData.side = o.name.endsWith('_l') ? 1 : -1;
  });
  return { root, ex };
}

/**
 * Her arms down beside her body (the GLB's bind pose holds them out): each upper arm turned toward straight down by
 * `deg` of the way there in 90ths (80: most of the way, the hands clear of the hips). Idle hands; never above the shoulder.
 */
function lowerArms(root, deg) {
  const bones = {};
  root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const out = {};
  for (const s of ['l', 'r']) {
    const ua = bones[`upperarm_${s}`], hand = bones[`hand_${s}`], pelvis = bones.pelvis;
    if (!ua || !hand) continue;
    root.updateMatrixWorld(true);
    // the world axis that turns the arm down: the body's forward (+z) crossed with the arm's direction
    const sh = ua.getWorldPosition(new THREE.Vector3()), hd = hand.getWorldPosition(new THREE.Vector3());
    const dir = hd.clone().sub(sh).normalize();
    const down = new THREE.Vector3(0, -1, 0);
    const ang = dir.angleTo(down) * (deg / 90);
    const axisW = dir.clone().cross(down).normalize();
    if (axisW.lengthSq() < 1e-6) continue;
    // world-space rotation into the bone's parent space
    const pq = ua.parent.getWorldQuaternion(new THREE.Quaternion());
    const qW = new THREE.Quaternion().setFromAxisAngle(axisW, ang);
    const qL = pq.clone().invert().multiply(qW).multiply(pq);
    ua.quaternion.premultiply(qL);
    root.updateMatrixWorld(true);
    out[s] = { handY: +hand.getWorldPosition(new THREE.Vector3()).y.toFixed(3), pelvisY: +(pelvis?.getWorldPosition(new THREE.Vector3()).y ?? 0).toFixed(3) };
  }
  return out;
}

async function main() {
  const order = ['kiln', 'spindle', 'davit', 'sonde'];
  const X = { brea: 0, kiln: 4.6, spindle: 9.4, davit: 13.6, sonde: 19.2 };
  const hulls = {};
  for (const k of order) { const h = buildHull(k); hulls[k] = h; scene.add(h); LU.measured[k] = boxOf(h); h.position.x = X[k]; }
  const { root: brea, ex } = await loadBrea();
  scene.add(brea);
  LU.arms = lowerArms(brea, Number(q.get('arm') ?? 80));
  LU.measured.brea = { ...boxOf(brea), bodyHeight: ex.bodyHeight ?? null };
  brea.position.x = X.brea;
  scene.add(staff(-1.4, 0));
  const note = document.getElementById('note');

  if (VIEW === 'sonde') {
    // the Sonde moored in the trade by its own rules (rule 21: the page draws the brain's hull, heading, shackle and keel
    // ring, never its own copy of them), Brea at the post, the lens 12 m back (F23-sonde's staging)
    for (const k of ['kiln', 'spindle', 'davit']) hulls[k].visible = false;
    const S = new SondeBrain({ post: { x: 0, y: 0, z: 0 } });
    for (let t = 0; t < 60; t += 1 / 60) S.step(1 / 60, { wind: { speed: 5, fromDeg: 45 }, groundY: () => 0 });
    // the mooring as one rigid group at the post (x 1.2), turned so the wind's downwind runs to +x across the frame
    const px = 1.2, dw = downwind({ fromDeg: 45 });
    const moor = new THREE.Group(); moor.position.set(px, 0, 0); moor.rotation.y = Math.atan2(dw.z, dw.x);
    scene.add(moor);
    const sonde = hulls.sonde; scene.remove(sonde); moor.add(sonde);
    sonde.position.set(S.x - S.post.x, S.y - S.post.y, S.z - S.post.z); sonde.rotation.y = S.heading;
    moor.add(post(0, 0));
    const sh = S.shackle(), kl = S.keel();
    moor.add(tether([sh.x - S.post.x, sh.y - S.post.y, sh.z - S.post.z], [kl.x - S.post.x, kl.y - S.post.y, kl.z - S.post.z]));
    moor.updateMatrixWorld(true);
    // measured on the page: the drawn tether's two ends in the world (the group's transform applied)
    const A = new THREE.Vector3(sh.x - S.post.x, sh.y - S.post.y, sh.z - S.post.z).applyMatrix4(moor.matrixWorld);
    const B = new THREE.Vector3(...SONDE_KEEL).applyMatrix4(sonde.matrixWorld);
    LU.measured.sondeTether = { altM: +(B.y - A.y).toFixed(3), leanM: +Math.hypot(B.x - A.x, B.z - A.z).toFixed(3), tetherM: +A.distanceTo(B).toFixed(3),
      node: { tetherM: +S.tetherDist().toFixed(3), altM: +(kl.y - sh.y).toFixed(3) } };
    const top = new THREE.Box3().setFromObject(sonde, true);
    // the lens 12 m back from the post, at her eye height, wide enough for her feet and the envelope's top
    camera.fov = 74; camera.position.set(px + 4.6, 1.6, 12); camera.lookAt(px + 4.6, 1.6 + 12 * Math.tan(25 * Math.PI / 180), 0);
    const T = LU.measured.sondeTether;
    tag('Sonde', `3.0 m, on its 18 m tether, taut (keel ${T.altM.toFixed(1)} m over the shackle, ${T.leanM.toFixed(1)} m downwind, tether ${T.tetherM.toFixed(2)} m)`, [(top.min.x + top.max.x) / 2, top.max.y + 0.6, (top.min.z + top.max.z) / 2]);
    tag('Brea', 'scale figure · 1.72 m, at the post', [-0.6, 2.2, 0]);
    LU.measured.sondeLens = { backM: 12, fov: camera.fov, eyeM: 1.6 };
    note.textContent = 'M3 wave 1 grey hulls (area C): the Sonde moored in the trade (5 m/s from 045) by its own rules, its 18 m banded tether taut, lens 12 m back at eye height. Proportion and silhouette only.';
  } else {
    // the Sonde moored low for scale beside the rest: its post and a short banded tether
    const sonde = hulls.sonde; sonde.position.y = 1.4;
    const yaw = VIEW === 'side' ? Math.PI / 2 : VIEW === 'quarter' ? 35 * Math.PI / 180 : 0;
    for (const k of order) hulls[k].rotation.y = yaw;
    brea.rotation.y = yaw;
    scene.add(post(X.sonde + 2.6, 0.6));
    sonde.updateMatrixWorld(true);
    const keel = new THREE.Vector3(...SONDE_KEEL).applyMatrix4(sonde.matrixWorld);
    scene.add(tether([X.sonde + 2.6, SONDE_POST.h, 0.6], keel.toArray()));
    camera.fov = 20; camera.position.set(9.4, 3.0, 40); camera.lookAt(9.4, 2.6, 0);
    const m = LU.measured;
    tag('Brea', `scale figure · ${m.brea.bodyHeight ?? 1.72} m body`, [X.brea, m.brea.H + 0.35, 0]);
    tag('Kiln', `${m.kiln.H} m · large`, [X.kiln, m.kiln.H + 0.35, 0]);
    tag('Spindle', `${m.spindle.H} m · medium`, [X.spindle, m.spindle.H + 0.35, 0]);
    tag('Davit', `${m.davit.H} m · medium`, [X.davit, m.davit.H + 0.35, 0]);
    tag('Sonde', `${m.sonde.H} m · small · moored low here`, [X.sonde, 1.4 + m.sonde.H + 0.35, 0]);
    note.textContent = `M3 wave 1 grey hulls (area C), ${VIEW === 'side' ? 'side-on (each turned 90 deg)' : VIEW === 'quarter' ? 'three-quarter (each turned 35 deg)' : 'front'}${SIL ? ', silhouettes' : ''}. Proportion and silhouette only; lamps in calm bone-gold; the staff at left is banded every 0.5 m.`;
  }
  if (WAVE !== '1') {
    // the second page: each form's one line of what changed (wave 2), at the foot of the frame
    note.textContent = note.textContent.replace('M3 wave 1 grey hulls', `M3 wave ${WAVE} grey hulls`);
    const foot = document.createElement('div'); foot.id = 'changed';
    foot.innerHTML = '<b>What changed since the first page</b>' + ['kiln', 'spindle', 'davit', 'sonde'].filter((k) => VIEW !== 'sonde' || k === 'sonde')
      .map((k) => `<div><b>${k[0].toUpperCase()}${k.slice(1)}:</b> ${WAVE2_NOTES[k]}.</div>`).join('');
    document.body.appendChild(foot);
    LU.notes = WAVE2_NOTES;
  }
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  placeTags();
  LU.ready = true;
}

main().catch((e) => { LU.error = String(e?.stack || e).slice(0, 600); console.error(e); });
