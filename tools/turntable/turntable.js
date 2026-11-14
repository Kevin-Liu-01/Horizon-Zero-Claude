/**
 * Single-asset turntable page (M0.13, TECH §8): one model, studio light, no world, no game systems. For the art
 * loop: look, adjust, rebuild, look again, in its own small headless Chrome beside the gate Chrome.
 *
 *   /tools/turntable/?asset=/models/hero/brea.glb[&spin=0.35][&yaw=0][&height=1.0][&dist=2.6][&size=1024x1024]
 *
 * Loads the GLB the way the game does (meshopt, the page's one KTX2 loader), lights it with a neutral room
 * environment, a warm key and a cool rim, tone maps with AgX, and turns it. `window.__TT__` reports when it is
 * ready, what it drew and what it holds on the GPU; `window.__TT__.setYaw(deg)` stops the spin at a bearing.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { configureKTX2, ktx2Loader } from '../../src/core/ktx2.js';

const q = new URLSearchParams(location.search);
const asset = q.get('asset') || '/models/hero/brea.glb';
const spin = Number(q.get('spin') ?? 0.35);            // radians per second
const height = Number(q.get('height') ?? 1.0);
const dist = Number(q.get('dist') ?? 2.6);
const TT = window.__TT__ = { ready: false, asset, error: null };

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.AgXToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
configureKTX2(renderer);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8f8a84);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const key = new THREE.DirectionalLight(0xfff1e0, 2.2); key.position.set(2.2, 3.2, 2.6); key.castShadow = true;
key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -1.5; key.shadow.camera.right = 1.5; key.shadow.camera.top = 2.2; key.shadow.camera.bottom = -0.2;
const rim = new THREE.DirectionalLight(0xdfe8ff, 1.4); rim.position.set(-2.5, 2.4, -2.8);
scene.add(key, rim);
const floor = new THREE.Mesh(new THREE.CircleGeometry(1.6, 64), new THREE.MeshStandardMaterial({ color: 0x77726c, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.05, 50);
camera.position.set(0, height, dist); camera.lookAt(0, height * 0.92, 0);
const pivot = new THREE.Group(); scene.add(pivot);

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
loader.setKTX2Loader(ktx2Loader());
let yawFixed = q.has('yaw') ? THREE.MathUtils.degToRad(Number(q.get('yaw'))) : null;
TT.setYaw = (deg) => { yawFixed = deg == null ? null : THREE.MathUtils.degToRad(deg); };

loader.loadAsync(asset).then((gltf) => {
  const root = gltf.scene;
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  pivot.add(root);
  if (gltf.animations?.length) {
    const mixer = new THREE.AnimationMixer(root);
    const idle = gltf.animations.find((a) => /idle|rest/i.test(a.name)) || gltf.animations[0];
    mixer.clipAction(idle).play();
    TT.mixer = mixer;
  }
  renderer.compile(scene, camera);
  TT.ready = true;
}).catch((e) => { TT.error = String(e?.message || e); console.error('[turntable] load failed:', e); });

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
  pivot.rotation.y = yawFixed != null ? yawFixed : pivot.rotation.y + spin * dt;
  TT.mixer?.update(dt);
  renderer.render(scene, camera);
  const i = renderer.info;
  TT.frame = { draws: i.render.calls, triangles: i.render.triangles, textures: i.memory.textures, geometries: i.memory.geometries, programs: i.programs?.length ?? null };
  document.getElementById('hud').textContent = `${asset}  ${i.render.calls} draws  ${i.render.triangles} tris  ${i.memory.textures} tex`;
});
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
