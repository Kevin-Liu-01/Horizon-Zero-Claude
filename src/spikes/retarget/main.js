/**
 * Spike A — retarget CC0 clips onto the existing Fortnite/UE4-style Aloy rig.
 *
 * URL params:
 *   clip=<name>        source clip (default Idle_Loop; case-insensitive, prefix ok)
 *   t=<sec>            clip time to freeze on (shot mode) / start at
 *   shot=1             freeze at t, set window.__READY__ after first render
 *   play=1             animate in real time (default when not in shot mode)
 *   cam=3q|front|side|back   zoom=<f>
 *   src=1              show the CC0 mannequin playing the same clip beside Aloy
 *   fix=all|arms|none  rest-pose correction scope
 *   fingers=0          drop finger bones from the map
 *   ground=0           disable constant ground shift
 *   root=keep          keep root-bone motion (default strip)
 *   hipScale=<f>       override hip translation scale
 *   pose=bind|rest     diagnostics: Aloy bind pose / Aloy posed into source rest
 *   skel=1             SkeletonHelper on Aloy       hud=0 hides the overlay
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Assets } from '../../core/assets.js';
import { Retargeter, collectBones } from './retarget.js';
import { detectSourceMap, stripFingers, AIM_RULES, CONTACT_BONES } from './boneMap.js';

const SOURCE_URL = '/anims-retarget/AnimationLibrary_Godot_Standard.gltf';
const ALOY_SPEC = { url: '/models/aloy.glb', targetHeight: 1.72, yaw: 0, yOffset: -0.055 }; // == assets.js SPECS.aloy

const params = new URLSearchParams(location.search);
const P = {
  clip: params.get('clip') || 'Idle_Loop',
  t: parseFloat(params.get('t') ?? '0') || 0,
  shot: params.has('shot'),
  play: params.get('play') === '1' || (!params.has('shot') && params.get('play') !== '0'),
  cam: params.get('cam') || '3q',
  zoom: parseFloat(params.get('zoom') || '1') || 1,
  src: params.get('src') === '1',
  fix: params.get('fix') || 'all',
  fingers: params.get('fingers') !== '0',
  ground: params.get('ground') !== '0',
  root: params.get('root') === 'keep' ? 'keep' : 'strip',
  hipScale: params.has('hipScale') ? parseFloat(params.get('hipScale')) : null,
  pose: params.get('pose') || null,
  skel: params.get('skel') === '1',
  hud: params.get('hud') !== '0',
};

const hud = document.getElementById('hud');
if (!P.hud) hud.classList.add('hidden');
const say = (s) => { hud.textContent = s; };

/* ------------------------------- scene ------------------------------- */
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3038);
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 100);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({ color: 0x77726a, roughness: 1, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(30, 60, 0x3a3f46, 0x3a3f46);
grid.position.y = 0.002;
scene.add(grid);

scene.add(new THREE.HemisphereLight(0xd6dfeb, 0x4a4036, 1.1));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
sun.position.set(3, 6, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -4; sun.shadow.camera.right = 4;
sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -4;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 20;
sun.shadow.bias = -0.0005;
scene.add(sun);

function placeCamera() {
  const fx = P.src ? -0.65 : 0;
  const d = (P.src ? 4.8 : 3.6) / P.zoom;
  const focus = new THREE.Vector3(fx, 0.9, 0);
  switch (P.cam) {
    case 'front': camera.position.set(fx, 1.15, d); break;
    case 'back': camera.position.set(fx, 1.15, -d); break;
    case 'side': camera.position.set(fx + d, 1.0, 0); break;
    default: camera.position.set(fx + d * 0.66, 1.4, d * 0.75); break; // 3q
  }
  camera.lookAt(focus);
}
placeCamera();
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

/* ------------------------------- load -------------------------------- */
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

let mixer = null, srcMixer = null, retargeter = null, baked = null;
let srcClips = [];
const clock = new THREE.Clock();
let ready = false;
let playing = P.play;

const state = { aloy: null, src: null, clipName: null, time: P.t };

async function boot() {
  say('loading aloy.glb + UAL clips…');
  const [aloyGltf, ualGltf] = await Promise.all([
    loader.loadAsync(ALOY_SPEC.url),
    loader.loadAsync(SOURCE_URL),
  ]);

  // identical char-space normalization to the live game (feet y=0, 1.72 m, +Z fwd)
  const model = new Assets()._normalize('aloy', aloyGltf, ALOY_SPEC);
  const aloy = SkeletonUtils.clone(model.root); // what Player does: a skeleton clone of aloy.root
  aloy.position.set(0, 0, 0);
  scene.add(aloy);
  state.aloy = aloy;

  const src = ualGltf.scene;
  src.position.set(-1.3, 0, 0);
  src.visible = P.src;
  src.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(src);
  state.src = src;
  srcClips = ualGltf.animations;
  scene.updateMatrixWorld(true);

  if (P.skel) scene.add(new THREE.SkeletonHelper(aloy));

  const sBones = collectBones(src), tBones = collectBones(aloy);
  const det = detectSourceMap(sBones, tBones);
  const map = P.fingers ? det.map : stripFingers(det.map);
  retargeter = new Retargeter({
    targetRoot: aloy, sourceRoot: src, map, hip: det.hip, aim: AIM_RULES,
    correct: P.fix, hipScale: P.hipScale, rootMotion: P.root, contacts: CONTACT_BONES,
  });

  mixer = new THREE.AnimationMixer(aloy);
  srcMixer = new THREE.AnimationMixer(src);

  window.__RETARGET__ = {
    clips: srcClips.map((c) => c.name),
    info: null,
    sourceKind: det.kind,
    setClip, setTime, getTime: () => state.time,
    play: () => { playing = true; clock.getDelta(); },
    pause: () => { playing = false; },
    retargeter, mixer, aloy, src,
  };

  if (P.pose === 'bind') {
    say(`Aloy BIND pose (no clip)\nsource=${det.kind} mapped=${retargeter.pairs.length}`);
  } else if (P.pose === 'rest') {
    retargeter.poseToSourceRest();
    say(`Aloy posed into SOURCE REST (rest-correction C only, fix=${P.fix})\nsource=${det.kind} mapped=${retargeter.pairs.length}`);
  } else {
    setClip(P.clip, P.t);
  }
}

function findClip(name) {
  const lc = name.toLowerCase();
  return srcClips.find((c) => c.name.toLowerCase() === lc)
    || srcClips.find((c) => c.name.toLowerCase().startsWith(lc))
    || srcClips.find((c) => c.name.toLowerCase().includes(lc))
    || null;
}

function setClip(name, t = 0) {
  const srcClip = findClip(name);
  if (!srcClip) {
    say(`clip "${name}" not found.\navailable:\n${srcClips.map((c) => c.name).join('\n')}`);
    window.__RETARGET__.info = { error: `clip ${name} not found` };
    return;
  }
  mixer.stopAllAction();
  srcMixer.stopAllAction();
  baked = retargeter.bake(srcClip, { groundFix: P.ground });
  state.clipName = srcClip.name;
  const action = mixer.clipAction(baked.clip);
  action.setLoop(THREE.LoopRepeat, Infinity).play();
  srcMixer.clipAction(srcClip).setLoop(THREE.LoopRepeat, Infinity).play();
  window.__RETARGET__.info = baked.info;
  setTime(t);
}

function setTime(t) {
  state.time = t;
  mixer.setTime(t);
  srcMixer.setTime(t);
  refreshHud();
}

function refreshHud() {
  if (!baked) return;
  const i = baked.info;
  say([
    `clip ${i.clip}   t=${state.time.toFixed(2)}/${i.duration}s   fps=${i.fps}   ${playing ? 'playing' : 'frozen'}`,
    `src=UAL(Rigify, CC0)  fix=${i.correct}  fingers=${P.fingers ? 'on' : 'off'}  root=${i.rootMotion}(disp ${i.rootDispMax}m)`,
    `hipScale=${i.hipScale}  sole y pre-fix [${i.soleMinPreFix}, ${i.soleMaxPreFix}]  groundShift=${i.groundShift}`,
    `mapped ${i.mapped} pairs  missingTarget=${i.missingTarget.length ? i.missingTarget.join(',') : 'none'}  unmappedSrc=${i.unmappedSource.join(',') || 'none'}`,
  ].join('\n'));
}

renderer.setAnimationLoop(() => {
  if (mixer && playing && !P.pose) {
    const dt = Math.min(clock.getDelta(), 0.05);
    mixer.update(dt);
    srcMixer.update(dt);
    state.time = (state.time + dt) % (baked ? baked.info.duration : 1);
    if (!P.shot) refreshHud();
  }
  renderer.render(scene, camera);
  if (!ready && state.aloy) {
    ready = true;
    window.__READY__ = true;
  }
});

boot().catch((err) => {
  console.error('[retarget-spike]', err);
  say(`ERROR: ${err.message}`);
  window.__READY__ = true;
});
