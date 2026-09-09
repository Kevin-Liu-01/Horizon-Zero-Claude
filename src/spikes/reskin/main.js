import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Assets } from '../../core/assets.js';
import { reskinToUAL, resolveClip, CLIP_ALIASES } from './reskin.js';

/**
 * Spike page: /spike-reskin.html?clip=<name>&t=<sec>[&cam=3view|front|side|back|shoulder|hips|hands|feet]
 *   [&weights=transfer|capsule][&skel=1][&wire=1]
 * Sets window.__READY__ once the requested frame is on screen. With `t`
 * present the pose is frozen at that clip time; without it the clip runs live
 * (keys: 1-9 clips, space pause).
 */
const params = new URLSearchParams(location.search);
const clipParam = params.get('clip') ?? 'idle';
const hasT = params.has('t');
const t0 = parseFloat(params.get('t') ?? '0') || 0;
const camMode = params.get('cam') ?? '3view';
const weightsMode = params.get('weights') ?? 'transfer';
const showSkel = params.has('skel');
const wire = params.has('wire');

// same spec values as Assets.SPECS.aloy (not exported; duplicated for the spike)
const ALOY_SPEC = { url: '/models/aloy.glb', targetHeight: 1.72, yaw: 0, yOffset: -0.055 };

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3038);
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x3a3226, 1.1));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
sun.position.set(2.5, 5, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -2.5;
sun.shadow.camera.right = sun.shadow.camera.top = 2.5;
sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 12;
sun.shadow.bias = -0.0004;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x9fb8d8, 0.6);
fill.position.set(-3, 2, -2);
scene.add(fill);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 8),
  new THREE.MeshStandardMaterial({ color: 0x55606a, roughness: 0.95 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(8, 32, 0x8899aa, 0x66727e);
grid.position.y = 0.002;
scene.add(grid);

const hud = document.getElementById('hud');
const say = (s) => { if (hud) hud.textContent = s; console.log(s); };

/* ---------------------------------------------------------------- */
/* cameras                                                           */
/* ---------------------------------------------------------------- */
function makeCam(az, dist = 3.6, h = 0.92, fov = 33, aspect = 1) {
  const c = new THREE.PerspectiveCamera(fov, aspect, 0.05, 50);
  c.position.set(Math.sin(az) * dist, h + 0.25, Math.cos(az) * dist);
  c.lookAt(0, h, 0);
  return c;
}
const CLOSEUPS = {
  far: { az: 0.45, dist: 9, h: 0.9, fov: 45 },
  shoulder: { az: 0.95, dist: 1.7, h: 1.2, fov: 34 },
  skirt: { az: 2.6, dist: 2.1, h: 0.7, fov: 34 },
  hips: { az: 0.6, dist: 1.5, h: 0.85, fov: 30 },
  hands: { az: 0.25, dist: 1.5, h: 0.85, fov: 30 },
  feet: { az: 0.7, dist: 1.6, h: 0.2, fov: 28 },
  back: { az: Math.PI, dist: 3.6, h: 0.92, fov: 33 },
  side: { az: Math.PI / 2, dist: 3.6, h: 0.92, fov: 33 },
  front: { az: 0.45, dist: 3.6, h: 0.92, fov: 33 },
};
let views = [];
function buildViews() {
  const W = renderer.domElement.width, H = renderer.domElement.height;
  views = [];
  if (camMode === '3view') {
    const w = Math.floor(W / 3);
    const a = w / H;
    views.push({ cam: makeCam(0.45, 3.6, 0.92, 33, a), x: 0, w, label: 'front 3/4' });
    views.push({ cam: makeCam(Math.PI / 2, 3.6, 0.92, 33, a), x: w, w, label: 'side (right)' });
    views.push({ cam: makeCam(Math.PI, 3.6, 0.92, 33, a), x: 2 * w, w: W - 2 * w, label: 'back' });
  } else {
    const c = CLOSEUPS[camMode] ?? CLOSEUPS.front;
    views.push({ cam: makeCam(c.az, c.dist, c.h, c.fov, W / H), x: 0, w: W, label: camMode });
  }
}

/* ---------------------------------------------------------------- */
/* load + reskin                                                     */
/* ---------------------------------------------------------------- */
let rig = null, mixer = null, action = null, clock = new THREE.Clock(), paused = false;
let charRoot = null, skelHelper = null;

async function boot() {
  say('loading aloy + UAL...');
  const assets = new Assets();
  const loader = new GLTFLoader();
  const [aloyGltf, ualGltf] = await Promise.all([
    assets.loader.loadAsync(ALOY_SPEC.url),
    loader.loadAsync('/anims-reskin/AnimationLibrary_Godot_Standard.gltf'),
  ]);
  const model = assets._normalize('aloy', aloyGltf, ALOY_SPEC);
  charRoot = model.root;
  scene.add(charRoot);
  charRoot.updateMatrixWorld(true);

  const t1 = performance.now();
  rig = reskinToUAL(charRoot, ualGltf, { weights: weightsMode, log: say, debug: params.has('debug') });
  const ms = (performance.now() - t1).toFixed(0);
  window.__RESKIN_MS__ = +ms;
  console.log('fitReport', JSON.stringify(rig.fitReport));

  if (wire) charRoot.traverse((o) => { if (o.isMesh && o.material) o.material.wireframe = true; });
  if (showSkel) {
    skelHelper = new THREE.SkeletonHelper(rig.root);
    skelHelper.material.depthTest = false;
    skelHelper.material.linewidth = 2;
    scene.add(skelHelper);
  }

  mixer = new THREE.AnimationMixer(rig.root);
  playClip(clipParam);
  window.__RIG__ = rig;
  window.__MIXER__ = mixer;
  window.__CLIPS__ = Object.keys(rig.clips);
  window.__DIAG__ = () => {
    charRoot.updateMatrixWorld(true);
    const r3 = (v) => v.toArray().map((x) => +x.toFixed(3));
    const out = { bones: {}, meshes: {}, sockets: {} };
    for (const n of ['root', 'DEF-hips', 'DEF-spine003', 'DEF-head', 'DEF-hand.L', 'DEF-hand.R', 'DEF-foot.L', 'DEF-toe.R']) {
      const b = rig.bones[THREE.PropertyBinding.sanitizeNodeName(n)];
      if (b) out.bones[n] = r3(b.getWorldPosition(new THREE.Vector3()));
    }
    for (const [k, s] of Object.entries(rig.sockets)) out.sockets[k] = r3(s.getWorldPosition(new THREE.Vector3()));
    for (const m of rig.meshes) {
      m.computeBoundingBox();
      const bb = m.boundingBox.clone().applyMatrix4(m.matrixWorld);
      const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
      out.meshes[m.name] = { min: r3(bb.min), max: r3(bb.max), bind: r3(new THREE.Vector3().setFromMatrixPosition(m.bindMatrix)),
        bindScale: +new THREE.Vector3().setFromMatrixScale(m.bindMatrix).x.toFixed(5),
        v0: [si.getX(0), si.getY(0), +sw.getX(0).toFixed(3), +sw.getY(0).toFixed(3)] };
    }
    return out;
  };
  buildViews();
  say(`${labelLine()} | reskin ${ms} ms`);
}

function labelLine() {
  const c = action?.getClip();
  return `clip=${c?.name ?? '-'} t=${mixer ? mixer.time.toFixed(2) : 0}s weights=${weightsMode} bones=${rig?.skeleton.bones.length} (${Object.keys(rig?.ualBones ?? {}).length} UAL + ${rig?.dynBones.length} dyn)`;
}

function playClip(name) {
  if (name === 'none') { mixer.stopAllAction(); action = null; return; } // pure bind pose
  const clip = resolveClip(rig.clips, name);
  if (!clip) { say(`unknown clip "${name}" — have: ${Object.keys(rig.clips).join(', ')}`); return; }
  mixer.stopAllAction();
  action = mixer.clipAction(clip);
  action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
  mixer.setTime(hasT ? t0 : 0);
}

const clipKeys = ['idle', 'walk', 'run', 'sprint', 'crouch-walk', 'crouch-idle', 'tpose', 'roll', 'jump'];
window.addEventListener('keydown', (e) => {
  const k = parseInt(e.key, 10);
  if (k >= 1 && k <= clipKeys.length) { playClip(clipKeys[k - 1]); }
  if (e.key === ' ') paused = !paused;
});
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  buildViews();
});

let readyFrames = 0;
function frame() {
  requestAnimationFrame(frame);
  if (!rig) return;
  const dt = clock.getDelta();
  if (!hasT && !paused) mixer.update(dt);
  charRoot.updateMatrixWorld(true);
  renderer.setScissorTest(true);
  const H = renderer.domElement.height;
  for (const v of views) {
    renderer.setViewport(v.x, 0, v.w, H);
    renderer.setScissor(v.x, 0, v.w, H);
    renderer.render(scene, v.cam);
  }
  renderer.setScissorTest(false);
  if (hud) hud.textContent = labelLine();
  if (readyFrames++ === 3) window.__READY__ = true;
}

boot().catch((err) => { say('ERROR ' + err.message); console.error(err); window.__ERROR__ = String(err); });
frame();
console.log('clip aliases:', CLIP_ALIASES);
