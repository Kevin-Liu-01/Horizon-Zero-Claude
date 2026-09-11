/**
 * Spike C (hybrid) — standalone page: Aloy (skeletonClone of the game asset)
 * driven by baked clip tracks through the procedural W/invW convention, next
 * to the source mannequin playing the RAW clip with THREE.AnimationMixer so
 * fidelity loss is visible side by side.
 *
 * URL params:
 *   clip=<baked name>|blend   (default blend)   t=<sec> (deterministic; omit = live)
 *   speed=<m/s> crouch=<0..1> (blend mode)      view=34|front|side|back
 *   conform=0                 disable the floor conform pass
 *   src=0                     hide the raw-clip mannequin
 *   skel=1                    show Aloy's SkeletonHelper
 *   bind=1                    show Aloy's bind pose (plumbing check)
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Assets } from '../../src/core/assets.js';
import { PosePlayer, LocomotionBlend, conformToFloor } from './posePlayer.js';

const params = new URLSearchParams(location.search);
const P = (k, d) => (params.has(k) ? params.get(k) : d);
const clipName = P('clip', 'blend');
const tParam = params.has('t') ? parseFloat(params.get('t')) : null;
const speed = parseFloat(P('speed', '0'));
const crouch = THREE.MathUtils.clamp(parseFloat(P('crouch', '0')), 0, 1);
const view = P('view', '34');
const conform = P('conform', '1') !== '0';
const showSrc = P('src', '1') !== '0';
const showSkel = P('skel', '0') === '1';
const bindOnly = P('bind', '0') === '1';

const app = document.getElementById('app');
const hud = document.getElementById('hud');
const say = (html) => { hud.innerHTML = html; };

/* ------------------------------- scene -------------------------------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2027);
scene.fog = new THREE.Fog(0x1b2027, 9, 22);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.05, 60);

scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x3b3128, 0.9));
const sun = new THREE.DirectionalLight(0xfff0dc, 2.2);
sun.position.set(3, 6, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -4; sun.shadow.camera.right = 4;
sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -4;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 20;
sun.shadow.bias = -0.0005;
scene.add(sun);
const rim = new THREE.DirectionalLight(0x8fb6ff, 0.8);
rim.position.set(-3, 3, -4);
scene.add(rim);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.95 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(20, 40, 0x6d7683, 0x474e58);
grid.position.y = 0.002;
scene.add(grid);

/* -------------------------------- load -------------------------------- */
const assets = new Assets();
const [aloyGltf, data, ualGltf] = await Promise.all([
  assets.loader.loadAsync('/models/aloy.glb'),
  fetch('/anims-hybrid/aloy-ual.json').then((r) => r.json()),
  showSrc ? new GLTFLoader().loadAsync('/anims-hybrid/ual/AnimationLibrary_Godot_Standard.gltf') : null,
]);
// identical wrapper convention to the game (feet y=0, 1.72 m, +Z forward)
const aloyModel = assets._normalize('aloy', aloyGltf, { url: '/models/aloy.glb', targetHeight: 1.72, yaw: 0, yOffset: -0.055 });
const aloy = skeletonClone(aloyModel.root);
scene.add(aloy);
aloy.updateMatrixWorld(true);

const player = new PosePlayer(aloy, data);
const loco = new LocomotionBlend(player);
const pose = player.newPose();

if (showSkel) {
  const helper = new THREE.SkeletonHelper(aloy);
  helper.material.depthTest = false;
  scene.add(helper);
}

/* ---- raw-clip mannequin (source rig) ---- */
let mixer = null, srcRoot = null, srcAction = null;
if (ualGltf) {
  srcRoot = ualGltf.scene;
  srcRoot.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      o.material = new THREE.MeshStandardMaterial({ color: 0x7f8b99, roughness: 0.6, metalness: 0.05 });
    }
  });
  scene.add(srcRoot);
  mixer = new THREE.AnimationMixer(srcRoot);
}

/* ------------------------------ layout -------------------------------- */
const target = new THREE.Vector3(0, 0.95, 0);
const sideBySide = view !== 'side';
aloy.position.set(sideBySide ? -0.85 : 0, 0, sideBySide ? 0 : 0.9);
if (srcRoot) srcRoot.position.set(sideBySide ? 0.85 : 0, 0, sideBySide ? 0 : -0.9);
if (!showSrc) aloy.position.set(0, 0, 0);
const camPos = {
  '34': new THREE.Vector3(2.6, 1.75, 3.6),
  front: new THREE.Vector3(0, 1.45, 4.4),
  side: new THREE.Vector3(4.6, 1.3, 0.2),
  back: new THREE.Vector3(-1.2, 1.7, -4.2),
}[view] || new THREE.Vector3(2.6, 1.75, 3.6);
camera.position.copy(camPos);
camera.lookAt(target);

/* ----------------------------- pose step ------------------------------ */
const clipList = Object.keys(data.clips);
let srcClipName = null;
function setSrcClip(name) {
  if (!mixer || srcClipName === name) return;
  const src = data.clips[name]?.src;
  const clip = ualGltf.animations.find((a) => a.name === src);
  if (!clip) return;
  if (srcAction) srcAction.stop();
  srcAction = mixer.clipAction(clip);
  srcAction.setLoop(data.clips[name].loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  srcAction.clampWhenFinished = true;
  srcAction.play();
  srcClipName = name;
}
function setSrcTime(t) {
  if (!srcAction) return;
  const c = data.clips[srcClipName];
  srcAction.time = c.loop ? ((t % c.duration) + c.duration) % c.duration : Math.min(t, c.duration - 1e-4);
  mixer.update(0);
}

let info = '';
function step(t, dt) {
  if (bindOnly) {
    player.apply(pose.identity());
    info = 'bind pose (A-pose) — plumbing check';
  } else if (clipName === 'blend') {
    if (tParam !== null) loco.setTime(t, speed, crouch); else loco.update(dt, speed, crouch);
    const dbg = loco.pose(speed, crouch, pose);
    player.apply(pose);
    const s = dbg.stand;
    const cr = dbg.crouch;
    info = `blend speed=${speed.toFixed(2)} m/s crouch=${crouch.toFixed(2)} · stand ${loco.stand[s.i].clip}→${loco.stand[s.i + 1].clip} w=${s.w.toFixed(2)}`
      + (cr ? ` · crouch ${loco.crouch[cr.i].clip}→${loco.crouch[cr.i + 1].clip} w=${cr.w.toFixed(2)}` : '')
      + ` · phase=${loco.phase.toFixed(2)}`;
    const dom = cr && crouch >= 0.5 ? cr.dominant : s.dominant;
    setSrcClip(dom);
    const dc = data.clips[dom];
    setSrcTime(dc.loop && dom !== 'idle' && dom !== 'crouch' ? ((loco.phase + dc.syncPhase) % 1) * dc.duration : loco.idleT);
  } else {
    if (!data.clips[clipName]) {
      info = `unknown clip "${clipName}" — have: ${clipList.join(', ')}`;
      player.apply(pose.identity());
    } else {
      player.evaluate(clipName, t, pose);
      player.apply(pose);
      const c = data.clips[clipName];
      info = `clip=${clipName} (${c.src}) t=${t.toFixed(2)}s / ${c.duration}s ${c.loop ? 'loop' : 'one-shot'} · pelvisΔ=(${pose.pelvis.x.toFixed(2)},${pose.pelvis.y.toFixed(2)},${pose.pelvis.z.toFixed(2)})`;
      setSrcClip(clipName);
      setSrcTime(t);
    }
  }
  let cf = { shift: 0, planted: 3, released: false };
  if (conform && !bindOnly) cf = conformToFloor(player, pose);
  aloy.updateMatrixWorld(true);
  const feet = cf.released ? 'released' : cf.planted === 0 ? 'flight' : `${cf.planted & 1 ? 'L' : ''}${cf.planted & 2 ? 'R' : ''} planted`;
  say(`<b>ALOY</b> — baked tracks via W⁻¹·R·W (hybrid pose player)${showSrc ? ' &nbsp;|&nbsp; <b>MANNEQUIN</b> — raw UAL clip (AnimationMixer)' : ''}<br>`
    + `<span class="dim">${info} · conform ${conform ? `on (${feet}, pelvis ${(cf.shift * 100).toFixed(1)} cm)` : 'off'} · hipScale ${player.hipScale.toFixed(3)}${player.missing.length ? ' · MISSING bones: ' + player.missing.join(',') : ''}</span>`);
}

/* ------------------------------- run ---------------------------------- */
window.__SPIKE__ = { player, loco, pose, data, aloy, scene, camera, renderer };
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

if (tParam !== null) {
  step(tParam, 0);
  renderer.render(scene, camera);
  // second frame so shadow maps / skinning are settled before the shot
  await new Promise((r) => requestAnimationFrame(r));
  step(tParam, 0);
  renderer.render(scene, camera);
  window.__READY__ = true;
} else {
  const clock = new THREE.Clock();
  let t = 0;
  let first = true;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;
    step(t, dt);
    renderer.render(scene, camera);
    if (first) { first = false; window.__READY__ = true; }
  });
}
