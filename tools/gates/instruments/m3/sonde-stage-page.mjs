/**
 * M3 area C, wave 2: THE SONDE'S MASK PROOF, the page half. A film staging (tools/frames/stagings/m3-instruments.mjs,
 * only when CALIMA_SONDE_PROOF=1 and only on the proof's second repeat) calls `install(f, api)`: the grey Sonde
 * (./grey-mesh.mjs, its form) is put into the game's scene MOORED at its post (SONDE_MOORING on the Sounding Ring's rise,
 * the post's foot on the game's own terrain), posed by its own rules (SondeBrain stepped 60 s in the frame's wind from
 * the environment's wind seam), with its post and its banded tether, casting and taking shadows as a hull does, its
 * materials registered with the environment (fog). Nothing else is touched; `api.undo` takes it all out again.
 * `window.__SONDE_PROOF__` records what was installed, for ./sonde-probe-page.mjs.
 *
 * The Sonde is not a registered kind (it ships nothing): this is the only way it enters a game frame before its art.
 */
import * as THREE from 'three';
import { buildGreyHull, strutMesh } from './grey-mesh.mjs';
import { SONDE_MOORING, SONDE_POST, SONDE_TETHER } from '../../../../src/instruments/kinds/sonde/form.js';
import { SondeBrain, bearingOf } from '../../../../src/instruments/kinds/sonde/rules.js';
import { siteById } from '../../../../src/world/island/sites.js';

const GREY = { hull: 0xa9a7a2, joint: 0x6d6c69, brass: 0x8f8a7a, dark: 0x3a3936, glass: 0xd6f0ee };
const CALM = 0xf2ead3;

/** The post's foot in the engine frame (SONDE_MOORING: offset on a compass bearing from the Ring's site). */
export function postFoot(groundY) {
  const ring = siteById(SONDE_MOORING.site), b = SONDE_MOORING.bearingDeg * Math.PI / 180;
  const x = ring.x + Math.sin(b) * SONDE_MOORING.offsetM, z = ring.z - Math.cos(b) * SONDE_MOORING.offsetM;
  return { x, y: groundY(x, z), z };
}

export async function install(f, api) {
  const C = api.C, env = C.environment;
  const ground = (x, z) => C.terrain.getHeight(x, z);
  const P = postFoot(ground);
  // the frame's wind (the wind seam): speed at the post, blowing toward environment.wind
  const w = env?.wind || { x: -Math.SQRT1_2, z: Math.SQRT1_2 };
  const wind = { speed: env?.windAt ? env.windAt(P.x, P.z) : 5.5, fromDeg: bearingOf(-w.x, -w.z) };
  const S = new SondeBrain({ post: P });
  for (let t = 0; t < 60; t += 1 / 60) S.step(1 / 60, { wind, groundY: () => P.y });

  const mats = new Map();
  const matOf = (p) => {
    const key = p.lamp ? 'lamp' : p.dark ? 'dark' : p.vial ? 'glass' : p.tone || 'hull';
    if (!mats.has(key)) {
      const m = key === 'lamp' ? new THREE.MeshBasicMaterial({ color: CALM })
        : new THREE.MeshStandardMaterial({ color: GREY[key] ?? GREY.hull, roughness: key === 'brass' ? 0.45 : 0.7, metalness: key === 'brass' ? 0.3 : 0 });
      env?.registerMaterial?.(m);
      mats.set(key, m);
    }
    return mats.get(key);
  };
  const root = new THREE.Group(); root.name = 'm3c-sonde-proof';
  const hull = buildGreyHull(THREE, 'sonde', matOf);
  hull.position.set(S.x, S.y, S.z); hull.rotation.y = S.heading;
  root.add(hull);
  const jm = matOf({ tone: 'joint' });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(SONDE_POST.base, SONDE_POST.base, 0.12, 16), jm); base.position.set(P.x, P.y + 0.06, P.z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(SONDE_POST.r, SONDE_POST.r, SONDE_POST.h, 12), jm); pole.position.set(P.x, P.y + SONDE_POST.h / 2, P.z);
  root.add(base, pole);
  const sh = S.shackle(), kl = S.keel(), A = new THREE.Vector3(sh.x, sh.y, sh.z), B = new THREE.Vector3(kl.x, kl.y, kl.z), d = B.clone().sub(A), L = d.length();
  const bands = SONDE_TETHER.colours.map((c) => { const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.8 }); env?.registerMaterial?.(m); return m; });
  const n = Math.max(1, Math.round(L / SONDE_TETHER.bandM));
  for (let i = 0; i < n; i++) root.add(strutMesh(THREE, A.clone().addScaledVector(d, i / n).toArray(), A.clone().addScaledVector(d, (i + 1) / n).toArray(), SONDE_TETHER.r, 8, bands[i % 2]));
  root.traverse((o) => { if (o.isMesh) { o.castShadow = o.material !== mats.get('lamp'); o.receiveShadow = true; } });
  C.scene.add(root);
  root.updateMatrixWorld(true);
  api.undo(() => {
    C.scene.remove(root);
    root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of [...mats.values(), ...bands]) m.dispose();
    delete window.__SONDE_PROOF__;
  });
  window.__SONDE_PROOF__ = { frame: f.id, repeat: f._repeat || 1, post: P, wind, keel: kl, shackle: sh, tetherM: S.tetherDist(), hull: { x: S.x, y: S.y, z: S.z, heading: S.heading }, state: S.state };
  return window.__SONDE_PROOF__;
}
