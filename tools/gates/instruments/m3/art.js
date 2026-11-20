/**
 * M3 wave 3, area C: THE SURFACES AND THE BEHAVIOUR ON THE PAGE. The Kiln, the Davit and the Sonde as their finished
 * GLBs (tools/build/instruments/gen-m3-art.mjs, built on the accepted grey forms), each beside Brea, and each kind's
 * behaviour driven by its OWN rules module (src/instruments/kinds/<kind>/rules.js: rule 21, the page draws the brain's
 * state and never keeps a copy of it) in fixed sim steps of 1/60 s, so every number the page reports is the rules'
 * clock, the same in every run.
 *
 *   art.html?view=turn&kind=kiln|davit|sonde[&lamp=calm|wary|hostile]   a turntable beside Brea: __ART__.pose({ yaw })
 *   art.html?view=kiln     the Kiln at a wellhead: plugged and still, it wakes, shells for the area, Brine on the door
 *   art.html?view=davit    the Davit walks to a Kiln whose hose is off and re-seats it from its rack
 *   art.html?view=sonde    the Sonde moored on its banded tether; the row of its sight range on foot and in the glide
 *
 * `window.__ART__` = { ready, error, view, rows, timeline, seek(t, lens), pose({ yaw }), lampPx, measured }.
 * The film (./film-art.mjs) seeks the named moments of `timeline` and shoots each.
 *
 * Stand-ins the page draws itself (named, not content): the wellhead (a casing, a valve wheel and a hot collar; area A
 * owns the Yards' kit), the wellhead's hose while plugged, the shells and their landing shadows (KILN_RULES.mortar's
 * radii and darkness), the Brine mist (pots.js POTS.brine's 3.0 m and colour), the Davit's hoist cable. Brea is a flat
 * graphite scale figure (her body GLB carries no outfit; the game dresses her). The kinds do not walk on legs here:
 * they are not rigged until the game registers them, so the Davit glides along the path its rules walk.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { configureKTX2, ktx2Loader } from '../../../../src/core/ktx2.js';
import { LAMP_STATES } from '../../../../src/instruments/lamps.js';
import { KilnBrain, KILN_RULES, planVolley, shellWarning, kilnDamage, rng } from '../../../../src/instruments/kinds/kiln/rules.js';
import { DavitBrain, DAVIT_RULES } from '../../../../src/instruments/kinds/davit/rules.js';
import { SondeBrain, SONDE_RULES, sondeSightM, downwind } from '../../../../src/instruments/kinds/sonde/rules.js';
import { SONDE_POST, SONDE_TETHER } from '../../../../src/instruments/kinds/sonde/form.js';
import { WELLHEADS } from '../../../../src/world/sites/kilnyards-layout.js';
import { PotField, POTS } from '../../../../src/combat/pots.js';
import { perceptionScale } from '../../../../src/instruments/lib/weather.js';

const q = new URLSearchParams(location.search);
const VIEW = q.get('view') || 'turn';
const KIND = q.get('kind') || 'kiln';
const LAMP0 = ['calm', 'wary', 'hostile'].includes(q.get('lamp')) ? q.get('lamp') : 'calm';
const A = window.__ART__ = { ready: false, error: null, view: VIEW, kind: KIND, rows: {}, timeline: {}, measured: {}, lampPx: null, events: [] };
const DT = 1 / 60;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.AgXToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
configureKTX2(renderer);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(24, window.innerWidth / window.innerHeight, 0.1, 900);
const note = document.getElementById('note'), read = document.getElementById('read');

/** Golden-weighted light: a warm low key from the front right, a cool sky fill and rim. */
function lights({ yard = false } = {}) {
  scene.environmentIntensity = yard ? 0.35 : 0.5;
  const key = new THREE.DirectionalLight(0xffdcae, yard ? 2.6 : 2.3);
  key.position.set(yard ? 30 : 16, yard ? 16 : 14, yard ? 24 : 22); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  const R = yard ? 45 : 14;
  Object.assign(key.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 160 });
  scene.add(key, key.target);
  const hemi = new THREE.HemisphereLight(0xc9d6e6, 0x5b5148, yard ? 0.5 : 0.45);
  const rim = new THREE.DirectionalLight(0xcfdcf2, 0.9); rim.position.set(-14, 10, -18);
  scene.add(hemi, rim);
  return key;
}

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
loader.setKTX2Loader(ktx2Loader());

/**
 * A kind's GLB as a posable object: the hull, its glass, its `tool` nodes each on a pivot at its anchor, the LOD1
 * caster hidden (the hull casts), and its lamp drawn at the socket in the state's token (calm by default).
 */
async function loadKind(kind) {
  const gltf = await loader.loadAsync(`/models/instruments/${kind}.glb`);
  const root = new THREE.Group(); root.name = kind;
  const model = gltf.scene; root.add(model);
  const ex = gltf.parser.json.asset.extras || {};
  const S = ex.r5Sockets || {};
  const nodes = {};
  model.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    if (o.name) nodes[o.name] = o;
  });
  for (const [n, o] of Object.entries(nodes)) if (/-lod1$/.test(n)) o.visible = false;
  const tools = {};
  for (const [name, anchor] of Object.entries(ex.r5Tools || {})) {
    const node = nodes[name];
    if (!node) continue;
    // the node keeps its own transform (quantised positions carry their scale and offset on the node): it hangs in a
    // group at -anchor inside a pivot at +anchor, so turning the pivot turns it about its anchor in the body frame
    const pivot = new THREE.Group(), inner = new THREE.Group(); pivot.name = `${name}-pivot`; pivot.position.set(...anchor);
    inner.position.set(-anchor[0], -anchor[1], -anchor[2]);
    (node.parent || model).add(pivot); pivot.add(inner); inner.add(node);
    tools[name] = pivot;
  }
  let fireMat = null;
  model.traverse((o) => { if (o.isMesh && /fire/.test(o.material?.name || '')) { fireMat = o.material; fireMat.emissiveIntensity = 0; } });
  // the lamp: an iris disc on the drum's face, or the Sonde's lantern (lit all round)
  const lampMat = new THREE.MeshBasicMaterial({ color: parseInt(LAMP_STATES[LAMP0].token.slice(1), 16), toneMapped: false });
  let lamp;
  if (S.lampShape === 'lantern') {
    lamp = new THREE.Mesh(new THREE.CylinderGeometry(S.lampR, S.lampR, S.lampH ?? 0.2, 20), lampMat);
    lamp.position.set(...S.lamp);
  } else {
    lamp = new THREE.Mesh(new THREE.CircleGeometry(S.lampR, 28), lampMat);
    lamp.position.set(S.lamp[0], S.lamp[1], S.lamp[2] + 0.003);
  }
  lamp.name = 'lamp'; model.add(lamp);
  return { root, model, ex, S, nodes, tools, lamp, lampMat, fireMat, stats: ex.r5Stats };
}
function setLamp(K, state) { K.lampMat.color.setHex(parseInt(LAMP_STATES[state].token.slice(1), 16)); K.lampState = state; }

/** Brea as a flat graphite scale figure, her arms lowered beside her (never above the shoulder). */
async function loadBrea() {
  const gltf = await loader.loadAsync('/models/hero/brea.glb');
  const root = gltf.scene, ex = gltf.parser?.json?.asset?.extras?.r5Hero || {};
  root.scale.setScalar(ex.scale ?? 1);
  const FIG = new THREE.MeshStandardMaterial({ color: 0x4a4642, roughness: 0.8 });
  const bones = {};
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.material = FIG; } if (o.isBone) bones[o.name] = o; });
  for (const s of ['l', 'r']) {
    const ua = bones[`upperarm_${s}`], hand = bones[`hand_${s}`];
    if (!ua || !hand) continue;
    root.updateMatrixWorld(true);
    const sh = ua.getWorldPosition(new THREE.Vector3()), hd = hand.getWorldPosition(new THREE.Vector3());
    const dir = hd.clone().sub(sh).normalize(), down = new THREE.Vector3(0, -1, 0);
    const axisW = dir.clone().cross(down).normalize();
    if (axisW.lengthSq() < 1e-6) continue;
    const pq = ua.parent.getWorldQuaternion(new THREE.Quaternion());
    const qW = new THREE.Quaternion().setFromAxisAngle(axisW, dir.angleTo(down) * (80 / 90));
    ua.quaternion.premultiply(pq.clone().invert().multiply(qW).multiply(pq));
  }
  root.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(root, true);
  return { root, H: +b.max.y.toFixed(3), bodyHeight: ex.bodyHeight ?? null };
}

const tags = [];
function tag(text, sub, at) { const el = document.createElement('div'); el.className = 'tag'; el.innerHTML = `${text}<small>${sub}</small>`; document.body.appendChild(el); const t = { el, at: new THREE.Vector3(...at) }; tags.push(t); return t; }
function placeTags() {
  for (const t of tags) {
    const p = t.at.clone().project(camera);
    t.el.style.display = p.z > 1 ? 'none' : '';
    t.el.style.left = `${((p.x + 1) / 2) * window.innerWidth}px`; t.el.style.top = `${((1 - p.y) / 2) * window.innerHeight}px`;
  }
}
function staff(x, z) {
  const g = new THREE.Group();
  const a = new THREE.MeshStandardMaterial({ color: 0xd2452e, roughness: 0.8 }), b = new THREE.MeshStandardMaterial({ color: 0xe6dcc8, roughness: 0.8 });
  for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), i % 2 ? b : a); m.position.set(x, 0.25 + i * 0.5, z); m.castShadow = true; g.add(m); }
  return g;
}
function ground(color, size = 600) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
  m.rotation.x = -Math.PI / 2; m.receiveShadow = true; scene.add(m); return m;
}
function render() {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  scene.updateMatrixWorld(true);
  renderer.render(scene, camera);
  placeTags();
  A.lampPx = {};
  for (const K of A._kinds || []) {
    if (!K.root.visible || !K.root.parent) continue;
    const c = new THREE.Box3().setFromObject(K.lamp).getCenter(new THREE.Vector3()).project(camera);
    A.lampPx[K.root.name] = [Math.round(((c.x + 1) / 2) * window.innerWidth), Math.round(((1 - c.y) / 2) * window.innerHeight)];
  }
  A.lampState = Object.fromEntries((A._kinds || []).map((K) => [K.root.name, K.lampState || LAMP0]));
}
const r3 = (v) => +(+v).toFixed(3);

/* ================================================================================================================ */
/* the turntable                                                                                                     */
/* ================================================================================================================ */
async function turn() {
  scene.background = new THREE.Color(0x7d7a76);
  lights();
  ground(0x6c6762);
  const K = await loadKind(KIND); A._kinds = [K];
  setLamp(K, LAMP0);
  const brea = await loadBrea();
  scene.add(K.root, brea.root);
  K.root.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(K.model, true);
  const H = b.max.y, halfW = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2;
  const bx = -(halfW + 1.2);
  brea.root.position.x = bx;
  scene.add(staff(bx - 0.9, 0));
  A.measured = { kind: KIND, H: r3(H), W: r3(b.max.x - b.min.x), L: r3(b.max.z - b.min.z), minY: r3(b.min.y), brea: brea.H, breaBody: brea.bodyHeight, tris: K.stats?.tris, bytes: null };
  const k = KIND[0].toUpperCase() + KIND.slice(1);
  const cx = (bx - 0.9 + halfW) / 2, span = Math.max(H * 1.25, (halfW - bx + 1.6) * 0.62);
  camera.fov = 24;
  const dist = (span / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(cx, H * 0.42 + 0.6, dist); camera.lookAt(cx, H * 0.46, 0);
  tag(k, `${A.measured.H} m · ${(K.stats?.tris ?? 0).toLocaleString('en')} triangles`, [0, H + 0.3, 0]);
  tag('Brea', `scale figure · ${brea.bodyHeight ?? 1.72} m`, [bx, brea.H + 0.3, 0]);
  A.pose = ({ yaw = 0 } = {}) => {
    K.root.rotation.y = THREE.MathUtils.degToRad(yaw);
    if (K.tools.rotorR) { K.tools.rotorR.rotation.y = yaw * 0.07; K.tools.rotorL.rotation.y = -yaw * 0.07; }
    note.textContent = `M3 wave 3 (area C): the ${k}'s surfaces on its accepted form, turned ${yaw} deg, beside Brea. Lamp ${LAMP0} ${LAMP_STATES[LAMP0].token}; staff banded every 0.5 m.`;
    render();
    return { yaw, lampPx: A.lampPx };
  };
  A.pose({ yaw: Number(q.get('yaw') || 0) });
}

/* ================================================================================================================ */
/* the Kiln at a wellhead                                                                                            */
/* ================================================================================================================ */
function wellheadProp() {
  const g = new THREE.Group();
  const gm = new THREE.MeshStandardMaterial({ color: 0x34322f, roughness: 0.55, metalness: 0.5 });
  const br = new THREE.MeshStandardMaterial({ color: 0xa07a3f, roughness: 0.38, metalness: 0.85 });
  const add = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  add(new THREE.CylinderGeometry(0.95, 1.05, 0.25, 28), gm, 0.125);
  add(new THREE.CylinderGeometry(0.36, 0.40, 1.3, 20), gm, 0.9);
  add(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 24), br, 1.55);
  const wheel = add(new THREE.TorusGeometry(0.32, 0.03, 6, 24), br, 1.72); wheel.rotation.x = Math.PI / 2;
  // the hot collar: a wellhead is what glows at the Yards (MP1); quenched, it goes dark
  const hot = new THREE.MeshStandardMaterial({ color: 0x2a1a12, emissive: 0xff7a2a, emissiveIntensity: 1.6, roughness: 0.6 });
  add(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 24), hot, 0.32);
  g.userData.hot = hot;
  return g;
}
function hoseMesh(a, b, r = 0.12) {
  const mid = a.clone().add(b).multiplyScalar(0.5); mid.y = Math.min(a.y, b.y) - 0.45;
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, r, 8, false), new THREE.MeshStandardMaterial({ color: 0x26231f, roughness: 0.8 }));
  m.castShadow = true; return m;
}

async function kilnView() {
  scene.background = new THREE.Color(0x9a958c);
  scene.fog = new THREE.Fog(0x9a958c, 60, 220);
  lights({ yard: true });
  ground(0x4d4945);
  const K = await loadKind('kiln'); A._kinds = [K];
  const brea = await loadBrea();
  scene.add(K.root, brea.root);
  // the wellheads seam's record (area A), moved so the wellhead stands at the page's origin
  const W0 = WELLHEADS[1], ox = W0.x, oz = W0.z;
  const W = { id: W0.id, x: 0, z: 0, state: 'hot', plugged: null, kilnStand: { ...W0.kilnStand, x: W0.kilnStand.x - ox, z: W0.kilnStand.z - oz } };
  const world = { wellheads: [W] };
  const well = wellheadProp(); scene.add(well);
  const B = new KilnBrain({ x: W.kilnStand.x, z: W.kilnStand.z, heading: 0, id: 'kiln-a' });
  B.stand = B._standFor(W); B.heading = B.stand.heading;          // set down square to its stand (it couples, then plugs)
  const h0 = B.heading, f0 = [Math.sin(h0), Math.cos(h0)], rt0 = [Math.cos(h0), -Math.sin(h0)];
  // Brea 31 m off its front-left, in the mortar's 25-60 m band
  const BR = { x: B.x + f0[0] * 26 - rt0[0] * 17, z: B.z + f0[1] * 26 - rt0[1] * 17 };
  brea.root.position.set(BR.x, 0, BR.z); brea.root.rotation.y = Math.atan2(B.x - BR.x, B.z - BR.z);
  tag('Brea', 'scale figure', [BR.x, brea.H + 0.4, BR.z]);
  const kTag = tag('Kiln', '', [B.x, 6.0, B.z]);

  // the clock and the script
  const S = { t: 0, plugAt: null, plugHeading: null, plugTurn: 0, wakeAt: null, awakeAt: null, volleyAt: null, volley: null, brineAt: null, sprungAt: null, shutAt: null, dmg: null };
  const WAKE_T = 130, rand = rng(7);
  const shells = [], shellMat = new THREE.MeshStandardMaterial({ color: 0x24211e, roughness: 0.5, metalness: 0.4 });
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false });
  const puffMat = new THREE.MeshStandardMaterial({ color: 0x8a7f72, roughness: 1, transparent: true, opacity: 0.0, depthWrite: false });
  let mist = null, hose = null;
  const stackTilt = { v: 0 };
  const muzzleLocal = new THREE.Vector3(0, 5.33, -0.2);
  const events = [];
  const doorStandIn = () => {
    const d = B.doorWorld();
    return new PotField('brine', { x: d.x + Math.sin(B.heading) * 1.2, y: 0, z: d.z + Math.cos(B.heading) * 1.2 });
  };
  function step() {
    const prevState = B.state;
    B.step(DT, world);
    S.t += DT;
    for (const e of B.events.splice(0)) { e.t = r3(S.t); events.push(e); }
    if (B.state === 'plugged') {
      if (S.plugAt === null) { S.plugAt = S.t; S.plugHeading = B.heading; }
      S.plugTurn = Math.max(S.plugTurn, Math.abs(B.heading - S.plugHeading));
    }
    if (S.wakeAt === null && S.t >= WAKE_T) { S.wakeAt = S.t; B.wake([B]); for (const e of B.events.splice(0)) { e.t = r3(S.t); events.push(e); } }
    if (B.state === 'awake' && prevState !== 'awake') S.awakeAt = S.t;
    // awake: the page turns it to her (the fight's turn at the rules' turnRate) and raises the stack; then one volley
    if (B.state === 'awake' && !B.staggered && S.volleyAt === null) {
      const err = B._turnTo(Math.atan2(BR.x - B.x, BR.z - B.z), DT);
      stackTilt.v = Math.min(0.42, stackTilt.v + 0.3 * DT);
      if (err < 0.01 && stackTilt.v >= 0.42) {
        S.volleyAt = S.t;
        S.volley = planVolley({ x: B.x, z: B.z }, BR, { dwellings: [], people: [] }, rand);
        events.push({ type: 'volley', t: r3(S.t), why: S.volley.why, cue: S.volley.cue });
        for (const sh of S.volley.shells) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), shellMat); m.castShadow = true; m.visible = false; scene.add(m);
          const sd = new THREE.Mesh(new THREE.CircleGeometry(1, 28), shadowMat.clone()); sd.rotation.x = -Math.PI / 2; sd.position.set(sh.x, 0.03, sh.z); sd.visible = false; scene.add(sd);
          const pf = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), puffMat.clone()); pf.position.set(sh.x, 0.4, sh.z); pf.visible = false; scene.add(pf);
          shells.push({ sh, m, sd, pf });
        }
      }
    }
    // the Brine Pot on the door, 6 s after the volley went (the door is hot for 30 s after it unplugged)
    if (S.volleyAt !== null && S.brineAt === null && S.t >= S.volleyAt + 6) {
      S.brineAt = S.t;
      const field = doorStandIn();
      const before = kilnDamage({ takeDamage: (h) => h.impact }, B, { impact: 40 });
      const r = B.brine({ kind: 'pot', field });
      const during = kilnDamage({ takeDamage: (h) => h.impact }, B, { impact: 40 });
      S.dmg = { before, during, ratio: during / before };
      S.brineResult = r;
      for (const e of B.events.splice(0)) { e.t = r3(S.t); events.push(e); }
      mist = { field, mesh: new THREE.Mesh(new THREE.SphereGeometry(POTS.brine.radius, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: POTS.brine.colour, transparent: true, opacity: 0.16, roughness: 1, depthWrite: false })) };
      mist.mesh.position.set(field.x, 0, field.z); mist.mesh.scale.y = 0.75; scene.add(mist.mesh);
    }
    if (mist) { mist.field.step(DT); mist.mesh.material.opacity = 0.16 * Math.max(0, mist.field.left / POTS.brine.lifeS); mist.mesh.visible = mist.field.alive; }
    for (const e of events) { if (e.type === 'door-sprung' && S.sprungAt === null) S.sprungAt = e.t; if (e.type === 'door-shut' && S.shutAt === null) S.shutAt = e.t; }
  }
  function draw() {
    K.root.position.set(B.x, 0, B.z); K.root.rotation.set(0, B.heading, 0);
    // the stagger: it rocks back on its legs where it stands, the door sprung on its hinge, the fire seen behind it
    if (B.staggered) {
      const u = 1 - B.staggerT / KILN_RULES.staggerS;
      K.root.rotation.x = -0.05 * Math.sin(u * Math.PI) - 0.015 * Math.sin(u * 40) * (1 - u);
      K.root.position.y = -0.06 * Math.sin(u * Math.PI);
    }
    const open = B.door === 'sprung' ? 1 : 0;
    K.tools.door.rotation.y = -THREE.MathUtils.degToRad(108) * open;
    if (K.fireMat) K.fireMat.emissiveIntensity = open ? 0.9 : 0;
    K.tools.stack.rotation.x = stackTilt.v;
    // the wellhead's hose while it is plugged (or coupling), from its coupling to the head
    if (hose) { scene.remove(hose); hose.geometry.dispose(); hose = null; }
    if (B.state === 'plugged' || (B.state === 'coupling' && B.stateT > 0.5)) {
      const c = B.couplingWorld();
      hose = hoseMesh(new THREE.Vector3(c.x, c.y, c.z), new THREE.Vector3(W.x, 1.25, W.z)); scene.add(hose);
    }
    setLamp(K, B.state === 'plugged' || B.state === 'coupling' || B.state === 'walking' || B.state === 'idle' ? 'calm' : B.state === 'unplugging' ? 'wary' : 'hostile');
    // the shells: in flight from the muzzle, each landing's shadow and whistle from the top of its lob to impact
    if (S.volley) {
      K.root.updateMatrixWorld(true);
      const mz = muzzleLocal.clone().applyMatrix4(K.tools.stack.matrixWorld);
      const vt = S.t - S.volleyAt;
      for (const { sh, m, sd, pf } of shells) {
        const u = (vt - sh.fireT) / (sh.impactT - sh.fireT);
        m.visible = u > 0 && u < 1;
        if (m.visible) { m.position.set(mz.x + (sh.x - mz.x) * u, mz.y * (1 - u) + 4 * sh.top * u * (1 - u) * 1.0, mz.z + (sh.z - mz.z) * u); }
        const w = shellWarning(sh, vt);
        sd.visible = !!w.shadow;
        if (w.shadow) { sd.scale.setScalar(w.shadow.r); sd.material.opacity = 0.55 * w.shadow.k; }
        const pu = (vt - sh.impactT) / 1.2;
        pf.visible = pu > 0 && pu < 1;
        if (pf.visible) { pf.scale.setScalar(0.6 + 2.2 * pu); pf.material.opacity = 0.55 * (1 - pu); }
      }
    }
    kTag.at.set(B.x, 6.0, B.z);
    kTag.el.innerHTML = `Kiln<small>${B.state}${B.staggered ? ', staggered' : ''} · door ${B.door} · lamp ${K.lampState}</small>`;
    well.userData.hot.emissiveIntensity = W.state === 'hot' ? 1.6 : 0;
  }
  const lens = (name) => {
    const h = B.heading, f = [Math.sin(h), Math.cos(h)], r = [Math.cos(h), -Math.sin(h)];
    const P = (fa, ra, y) => [B.x + f[0] * fa + r[0] * ra, y, B.z + f[1] * fa + r[1] * ra];
    camera.fov = 30;
    if (name === 'plugged') { camera.position.set(...P(10.5, -7.5, 3.4)); camera.lookAt(...P(0, 1.3, 2.5)); }
    else if (name === 'wide') {
      // side-on to the line from the Kiln to her, 24 m off it: both in the frame and the shells' lobs over them
      const mx = (B.x + BR.x) / 2, mz = (B.z + BR.z) / 2, dx = BR.x - B.x, dz = BR.z - B.z, L = Math.hypot(dx, dz) || 1;
      camera.fov = 50; camera.position.set(mx + (dz / L) * 26, 4.5, mz - (dx / L) * 26); camera.lookAt(mx, 4.5, mz);
    }
    else if (name === 'door') { camera.position.set(...P(8.5, 3.2, 2.4)); camera.lookAt(...P(0.8, 0.2, 1.9)); }
    else { camera.position.set(...P(12, -6, 4)); camera.lookAt(...P(0, 0.6, 2.6)); }
  };
  A.timeline = {};
  A.seek = (t, lensName = 'plugged') => {
    while (S.t < t - 1e-9) step();
    draw(); lens(lensName);
    note.textContent = `M3 wave 3 (area C): the Kiln at a wellhead, by its own rules (kinds/kiln/rules.js) in 1/60 s steps. Sim ${S.t.toFixed(2)} s. Stand-ins drawn by the page: the wellhead, its hose, the shells' path, the Brine mist.`;
    read.textContent = rowsText();
    render();
    return { t: r3(S.t), state: B.state, door: B.door, staggerT: r3(B.staggerT), lamp: K.lampState, lampPx: A.lampPx, events: events.length };
  };
  // run the whole script once now for the rows and the named moments, then the film seeks back from a fresh page
  const rowsText = () => Object.entries(A.rows).map(([k, v]) => `${k}: ${v.verdict} ${v.text}`).join('\n');
  A.runAll = () => {
    while (S.t < WAKE_T + 30) step();
    const plugS = S.wakeAt - S.plugAt;
    const st = S.shutAt !== null && S.sprungAt !== null ? S.shutAt - S.sprungAt : null;
    const v = S.volley;
    const leads = v ? v.shells.map((s) => s.impactT - s.warnT) : [];
    const range = v ? Math.hypot(BR.x - B.x, BR.z - B.z) : null;
    // controls: Brine on a COLD door (a Kiln never plugged) and on the hot Kiln's back: no stagger
    const cold = new KilnBrain({ x: 50, z: 50, heading: 0 }); const d0 = cold.doorWorld();
    const coldR = cold.brine({ kind: 'pot', field: new PotField('brine', { x: d0.x, y: 0, z: d0.z + 1.2 }) });
    const back = new KilnBrain({ x: 0, z: 0, heading: 0 }); back.hotT = 10;
    const backR = back.brine({ kind: 'pot', field: new PotField('brine', { x: 0, y: 0, z: -3.2 }) });
    A.rows['kiln-plugged'] = { verdict: plugS >= KILN_RULES.plugMinS && S.plugTurn === 0 ? 'PASS' : 'FAIL', plugS: r3(plugS), turnRad: r3(S.plugTurn), text: `plugged ${plugS.toFixed(1)} s (>= ${KILN_RULES.plugMinS}), turned ${S.plugTurn.toFixed(4)} rad while plugged; the wellhead's hose on` };
    A.rows['kiln-wake'] = { verdict: S.awakeAt !== null && S.awakeAt - S.wakeAt <= KILN_RULES.unplugS + 0.05 ? 'PASS' : 'FAIL', unplugS: r3(S.awakeAt - S.wakeAt), text: `woken at ${S.wakeAt.toFixed(2)} s: unplugging, awake ${(S.awakeAt - S.wakeAt).toFixed(3)} s later (rules ${KILN_RULES.unplugS} s); lamp calm -> wary -> hostile` };
    A.rows['kiln-shells'] = { verdict: v && v.ok && v.shells.length === 3 && Math.min(...leads) >= KILN_RULES.mortar.warnS && range >= 25 && range <= 60 ? 'PASS' : 'FAIL', shells: v?.shells.length ?? 0, minLeadS: r3(Math.min(...leads)), rangeM: r3(range), text: `${v?.shells.length ?? 0} shells at ${range?.toFixed(1)} m; shadow and whistle lead impact by >= ${Math.min(...leads).toFixed(3)} s (bar ${KILN_RULES.mortar.warnS})` };
    A.rows['kiln-door'] = { verdict: st !== null && Math.abs(st - 2.0) <= 0.2 && S.dmg?.ratio === 1 && !coldR.stagger && !backR.stagger ? 'PASS' : 'FAIL', staggerS: st === null ? null : r3(st), damageRatio: S.dmg?.ratio ?? null, cold: coldR.why, back: backR.why, text: `Brine Pot on the hot door: sprung, stagger ${st?.toFixed(3)} s (2.0 +-0.2); damage x${S.dmg?.ratio} in the window (exactly 1); cold door: "${coldR.why}"; on its back: "${backR.why}"` };
    A.timeline = {
      plugged: 60, wake: r3(S.wakeAt + 0.8), turned: r3(S.volleyAt - 0.2), shells: r3(S.volleyAt + (v?.shells[1]?.warnT ?? 1.5) + 0.25),
      impact: r3(S.volleyAt + (v?.shells[0]?.impactT ?? 3) + 0.25), brine: r3(S.brineAt + 0.4), stagger: r3(S.brineAt + 1.6), shut: r3(S.shutAt + 0.3),
    };
    A.events = events.map((e) => ({ t: e.t, type: e.type, to: e.to, cue: e.cue }));
    return A.rows;
  };
}

/* ================================================================================================================ */
/* the Davit re-seats the Kiln's hose                                                                                */
/* ================================================================================================================ */
async function davitView() {
  scene.background = new THREE.Color(0x9a958c);
  scene.fog = new THREE.Fog(0x9a958c, 60, 220);
  lights({ yard: true });
  ground(0x4d4945);
  const Kk = await loadKind('kiln'), Kd = await loadKind('davit'); A._kinds = [Kk, Kd];
  const brea = await loadBrea();
  scene.add(Kk.root, Kd.root, brea.root);
  setLamp(Kk, 'wary'); setLamp(Kd, 'wary');
  // the Kiln stands still with its hose Pried off (the hit-parts seam's `off`); the Davit comes in on its right flank
  const kiln = { id: 'kiln', x: 0, z: 0, heading: 0, large: true, alive: true, parts: { hose: { state: 'off', hits: 0 } } };
  Kk.root.position.set(0, 0, 0);
  Kk.tools.hose.visible = false;
  const D = new DavitBrain({ x: 19, z: -0.10, heading: -Math.PI / 2 });
  brea.root.position.set(-6.5, 0, 9); brea.root.rotation.y = Math.atan2(0 - -6.5, 0 - 9);
  tag('Brea', 'scale figure', [-6.5, brea.H + 0.4, 9]);
  const kTag = tag('Kiln', '', [0, 6.0, 0]);
  const dTag = tag('Davit', '', [0, 4.8, 0]);
  const S = { t: 0, reachAt: null, reseatedAt: null, ev: null, platesBefore: D.plates };
  const events = [];
  let cable = null;
  const sheaveLocal = new THREE.Vector3(0.75, 4.0, 1.73);
  function step() {
    D.step(DT, { instruments: [kiln] });
    S.t += DT;
    for (const e of D.events.splice(0)) { e.t = r3(S.t); events.push(e); if (e.type === 'state' && e.to === 'reseating' && S.reachAt === null) S.reachAt = S.t; if (e.type === 'reseated') { S.reseatedAt = S.t; S.ev = e; } }
  }
  function draw() {
    Kd.root.position.set(D.x, 0, D.z); Kd.root.rotation.y = D.heading;
    Kk.tools.hose.visible = kiln.parts.hose.state !== 'off';
    for (let i = 1; i <= 3; i++) Kd.tools[`plate${i}`].visible = i > 3 - D.plates;   // the front plate goes first
    if (cable) { scene.remove(cable); cable = null; }
    if (D.state === 'reseating') {
      Kd.root.updateMatrixWorld(true);
      const a = sheaveLocal.clone().applyMatrix4(Kd.root.matrixWorld), b = new THREE.Vector3(1.74, 1.4, -0.1);
      const g = new THREE.CylinderGeometry(0.012, 0.012, a.distanceTo(b), 6); g.translate(0, a.distanceTo(b) / 2, 0);
      cable = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x2b2c30, roughness: 0.5, metalness: 0.5 }));
      cable.position.copy(b); cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.clone().sub(b).normalize()); scene.add(cable);
    }
    kTag.el.innerHTML = `Kiln<small>hose ${kiln.parts.hose.state}</small>`;
    dTag.at.set(D.x, 4.8, D.z);
    dTag.el.innerHTML = `Davit<small>${D.state} · plates ${D.plates} · repairs ${D.repairs}${D.job && D.state === 'reseating' ? ` · ${D.job.t.toFixed(1)} s` : ''}</small>`;
  }
  const lens = (name) => {
    camera.fov = 30;
    if (name === 'near') { camera.position.set(9.5, 4.2, 9.5); camera.lookAt(3.0, 1.9, -0.2); }
    else { camera.position.set(8, 6, 17); camera.lookAt(7, 1.6, 0); }
  };
  A.seek = (t, lensName = 'wide') => {
    while (S.t < t - 1e-9) step();
    draw(); lens(lensName);
    note.textContent = `M3 wave 3 (area C): the Davit re-seats the Kiln's Pried hose from its rack, by its own rules (kinds/davit/rules.js, the hit-parts seam's reseat) in 1/60 s steps. Sim ${S.t.toFixed(2)} s. The hoist cable is the page's stand-in; the kinds glide (not rigged yet).`;
    read.textContent = Object.entries(A.rows).map(([k, v]) => `${k}: ${v.verdict} ${v.text}`).join('\n');
    render();
    return { t: r3(S.t), state: D.state, plates: D.plates, hose: kiln.parts.hose.state };
  };
  A.runAll = () => {
    while (S.reseatedAt === null && S.t < 60) step();
    const visiblePlates = [1, 2, 3].filter((i) => i > 3 - D.plates).length;
    const reseatS = S.reseatedAt !== null ? S.reseatedAt - S.reachAt : null;
    const reach = Math.hypot(D.x - kiln.x, D.z - kiln.z);
    A.rows['davit-reseat'] = {
      verdict: reseatS !== null && Math.abs(reseatS - 4.0) <= 0.3 && kiln.parts.hose.state === 'sealed' && D.plates === 2 && visiblePlates === 2 ? 'PASS' : 'FAIL',
      reseatS: reseatS === null ? null : r3(reseatS), rulesT: S.ev?.t ?? null, plates: [S.platesBefore, D.plates], hose: kiln.parts.hose.state, reachM: r3(reach), walkS: r3(S.reachAt),
      text: `walked ${S.reachAt?.toFixed(2)} s to ${reach.toFixed(2)} m of the Kiln (reach ${DAVIT_RULES.reachM}); re-seated the hose in ${reseatS?.toFixed(3)} s (4.0 +-0.3); hose ${kiln.parts.hose.state}; plates ${S.platesBefore} -> ${D.plates} (${visiblePlates} on the rack)`,
    };
    A.timeline = { arrive: r3(S.reachAt * 0.55), reseating: r3(S.reachAt + 2.0), done: r3(S.reseatedAt + 0.5) };
    A.events = events.map((e) => ({ t: e.t, type: e.type, to: e.to, cue: e.cue }));
    return A.rows;
  };
}

/* ================================================================================================================ */
/* the Sonde moored, and its sight range on foot and in the glide                                                    */
/* ================================================================================================================ */
function bandedTether(a, b) {
  const g = new THREE.Group(), A0 = new THREE.Vector3(...a), B0 = new THREE.Vector3(...b), d = B0.clone().sub(A0), L = d.length();
  const n = Math.max(1, Math.round(L / SONDE_TETHER.bandM));
  const cols = SONDE_TETHER.colours.map((c) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.8 }));
  for (let i = 0; i < n; i++) {
    const p0 = A0.clone().addScaledVector(d, i / n), p1 = A0.clone().addScaledVector(d, (i + 1) / n), dd = p1.clone().sub(p0);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, dd.length(), 8), cols[i % 2]);
    m.position.copy(p0).addScaledVector(dd, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dd.normalize()); m.castShadow = true; g.add(m);
  }
  return g;
}
async function sondeView() {
  scene.background = new THREE.Color(0xa9b4bd);
  scene.fog = new THREE.Fog(0xa9b4bd, 80, 300);
  lights({ yard: true });
  ground(0x8f8579);
  const K = await loadKind('sonde'); A._kinds = [K];
  const brea = await loadBrea();
  scene.add(K.root, brea.root);
  const WIND = { speed: 5, fromDeg: 45 };
  const Sb = new SondeBrain({ post: { x: 0, y: 0, z: 0 } });
  for (let t = 0; t < 60; t += DT) Sb.step(DT, { wind: WIND, groundY: () => 0 });
  const post = new THREE.Group();
  const pm = new THREE.MeshStandardMaterial({ color: 0x34322f, roughness: 0.55, metalness: 0.5 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(SONDE_POST.base, SONDE_POST.base, 0.12, 16), pm); base.position.y = 0.06;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(SONDE_POST.r, SONDE_POST.r, SONDE_POST.h, 12), pm); pole.position.y = SONDE_POST.h / 2; pole.castShadow = true;
  post.add(base, pole); scene.add(post);
  K.root.position.set(Sb.x, Sb.y, Sb.z); K.root.rotation.y = Sb.heading;
  const sh = Sb.shackle(), kl = Sb.keel();
  scene.add(bandedTether([sh.x, sh.y, sh.z], [kl.x, kl.y, kl.z]));
  const dw = downwind(WIND);
  // Brea at the post, on its upwind side; the lens 12 m back from the post at her eye height (F23-sonde's staging)
  brea.root.position.set(-dw.x * 1.2, 0, -dw.z * 1.2); brea.root.rotation.y = Math.atan2(dw.x, dw.z);
  const top = new THREE.Box3().setFromObject(K.root, true);
  tag('Sonde', `moored, tether ${Sb.tetherDist().toFixed(2)} m, trade ${WIND.speed} m/s from ${WIND.fromDeg}`, [(top.min.x + top.max.x) / 2, top.max.y + 0.7, (top.min.z + top.max.z) / 2]);
  tag('Brea', 'scale figure, at the post', [-dw.x * 1.2, brea.H + 0.4, -dw.z * 1.2]);

  /**
   * The row: she comes in straight at the Sonde from 160 m out, upwind, (a) on foot at 4 m/s, eye 1.6 m, and (b) gliding
   * at 40 m over the ground at 10 m/s (flight 'gliding'). Each 1/60 s: seen = her 3-D distance to the hull's centre <=
   * sondeSightM(flight) x perceptionScale(trade by day). The first-seen distances and their ratio.
   */
  const hullC = new THREE.Vector3((top.min.x + top.max.x) / 2, (top.min.y + top.max.y) / 2, (top.min.z + top.max.z) / 2);
  const approach = (flight, speed, alt) => {
    const scale = perceptionScale({ weather: 'trade', nightFactor: 0 });
    for (let d = 160; d > 0; d -= speed * DT) {
      const p = new THREE.Vector3(hullC.x - dw.x * d, alt, hullC.z - dw.z * d);
      const dist = p.distanceTo(hullC);
      if (dist <= sondeSightM(flight) * scale) return { flight, firstSeenM: r3(dist), groundM: r3(d), stepM: r3(speed * DT), altM: alt };
    }
    return { flight, firstSeenM: null };
  };
  A.seek = (t = 0, lensName = 'post') => {
    if (K.tools.rotorR) { K.tools.rotorR.rotation.y = t * 25; K.tools.rotorL.rotation.y = -t * 25; }
    camera.fov = lensName === 'post' ? 74 : 40;
    if (lensName === 'post') { camera.position.set(dw.x * 4.6 + dw.z * 12, 1.6, dw.z * 4.6 - dw.x * 12); camera.lookAt(dw.x * 4.6, 1.6 + 12 * Math.tan(25 * Math.PI / 180), dw.z * 4.6); }
    else { camera.position.set(hullC.x + dw.z * 9 - dw.x * 4, hullC.y + 1.5, hullC.z - dw.x * 9 - dw.z * 4); camera.lookAt(hullC.x, hullC.y - 0.6, hullC.z); }
    note.textContent = `M3 wave 3 (area C): the Sonde moored in the trade by its own rules (kinds/sonde/rules.js), its 18 m banded tether taut, fans turning. Lens: ${lensName === 'post' ? '12 m back from the post at eye height (F23-sonde)' : 'near, at the envelope'}.`;
    read.textContent = Object.entries(A.rows).map(([k, v]) => `${k}: ${v.verdict} ${v.text}`).join('\n');
    render();
    return { t, lampPx: A.lampPx };
  };
  A.runAll = () => {
    const foot = approach('none', 4, 1.6), glide = approach('gliding', 10, 40);
    const ratio = foot.firstSeenM && glide.firstSeenM ? glide.firstSeenM / foot.firstSeenM : null;
    A.rows['sonde-glide-range'] = {
      verdict: ratio !== null && Math.abs(ratio - 2.0) <= 0.05 ? 'PASS' : 'FAIL', foot, glide, ratio: ratio === null ? null : r3(ratio),
      text: `first seen on foot at ${foot.firstSeenM} m, gliding at ${glide.firstSeenM} m (3-D, steps ${foot.stepM} / ${glide.stepM} m): x${ratio?.toFixed(3)} (bar x2.0 +-0.05); rules sight ${SONDE_RULES.sightM} m, kite x${SONDE_RULES.kiteRangeK}`,
    };
    A.timeline = { post: 0, near: 0.3 };
    return A.rows;
  };
}

async function main() {
  if (VIEW === 'turn') await turn();
  else if (VIEW === 'kiln') await kilnView();
  else if (VIEW === 'davit') await davitView();
  else if (VIEW === 'sonde') await sondeView();
  else throw new Error(`no view ${VIEW}`);
  // the rows run the whole script once; a film page (&run=0) seeks forward from the start instead
  if (A.runAll && q.get('run') !== '0') A.runAll();
  A.ready = true;
}
main().catch((e) => { A.error = String(e?.stack || e).slice(0, 800); console.error(e); });
