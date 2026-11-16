import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { makeArrow, setArrowType, makeBombVisual } from '../combat/arrows.js';

/**
 * THE MAKING LEDGER'S TURNTABLE AND ITS MATERIAL PICTURES (M1.6d; BIBLE §9 "turntable, no glow plate").
 *
 * One small WebGL canvas, made the first time the ledger opens and kept for the session (never a second one):
 * the selected item turns on it, lit by a warm key, a cool rim and a neutral room for the metal, over nothing
 * (no plate, no glow, no floor disc: the ledger's ruled ring under it is CSS). The same renderer draws each
 * island material once into a 128 px picture (`icon(id)`), cached as a data URL, for the recipe tiles.
 *
 * The arrows are the game's own (combat/arrows.js `makeArrow` + `setArrowType`: the shaft, head and fletch the
 * bow looses), their head materials cloned with the in-flight glint taken out; the cinder pot is the game's
 * thrown pot (`makeBombVisual('blast-bomb')`) with its band's glow taken out. The pots and the net the kit
 * cannot make yet, and the materials, are drawn here from a few primitives each.
 *
 * The turntable draws only while it is mounted and the tab is visible: one rAF, one item, 1 draw per part.
 * Under reduced motion it stands still at 28 deg.
 */

const TURN_S = 9;            // one turn
const ICON_PX = 128;

let shared = null;

function mat(color, rough = 0.7, metal = 0, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
}

/** Strip the in-flight glint and every sprite (the flame, the element glow): the item, lit, not lit up. */
function calm(root) {
  root.traverse((o) => {
    if (o.isSprite) { o.visible = false; return; }
    if (!o.isMesh) return;
    const m = o.material.clone();
    if (m.emissive) { m.emissiveIntensity = Math.min(m.emissiveIntensity ?? 0, 0.08); }
    o.material = m;
    o.castShadow = false;
  });
  return root;
}

/* --------------------------------------------------------------------------- the items */

function arrowItem(type) {
  const a = makeArrow();
  setArrowType(a, type);
  const g = new THREE.Group();
  // origin at the tail, tip at +Z: stand it on its tail, tip up, centred
  a.group.rotation.x = -Math.PI / 2;
  a.group.position.y = -a.len / 2;
  g.add(calm(a.group));
  // laid well over (63 deg off the turning axis) so it reads along the wide stage and the turn reads as a cone;
  // framed on its height there (0.35 m), not its length, so the shaft and the head read at ledger size
  g.rotation.z = -1.1;
  return { root: g, size: 0.42 };
}

function potItem(kind) {
  if (kind === 'cinderPot') {
    const v = makeBombVisual('blast-bomb');
    const g = new THREE.Group();
    v.group.scale.setScalar(2.2);
    g.add(calm(v.group));
    return { root: g, size: 0.44 };
  }
  // a clay pot with a cord at its neck: brine glazed pale, dust left as bisque
  const pts = [];
  const prof = [[0.0, -0.12], [0.07, -0.118], [0.105, -0.07], [0.115, -0.01], [0.1, 0.05], [0.06, 0.09], [0.042, 0.105], [0.046, 0.125], [0.04, 0.13]];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), kind === 'brinePot' ? mat(0x9DB4AE, 0.38) : mat(0xC9B79A, 0.9));
  const cord = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.006, 6, 24), mat(0x8C6F4A, 0.85));
  cord.rotation.x = Math.PI / 2; cord.position.y = 0.1;
  const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.03, 12), mat(0x5B4632, 0.8));
  plug.position.y = 0.14;
  const g = new THREE.Group();
  g.add(body, cord, plug);
  return { root: g, size: 0.32 };
}

function netItem() {
  const g = new THREE.Group();
  const cordM = mat(0xB89F78, 0.85);
  // a folded cast net: the mesh as cord lines over a low dome, the lead line of basalt sinkers round its hem
  const dome = new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.42);
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(dome, 1), new THREE.LineBasicMaterial({ color: 0xD9C9A6 }));
  lines.scale.set(1, 0.8, 1);
  g.add(lines);
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.006, 6, 40), cordM);
  hem.rotation.x = Math.PI / 2; hem.position.y = 0.03;
  g.add(hem);
  const sinkM = mat(0x3B3A36, 0.6);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), sinkM);
    s.position.set(Math.cos(a) * 0.135, 0.022, Math.sin(a) * 0.135);
    g.add(s);
  }
  const hand = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 6, 20), cordM);
  hand.position.y = 0.16;
  g.add(hand);
  g.position.y = -0.08;
  const w = new THREE.Group(); w.add(g); w.rotation.x = 0.35;
  return { root: w, size: 0.34 };
}

/* ------------------------------------------------------------------------ the materials */

function lumpy(geo, k, seed) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + k * Math.sin(x * 61 + seed) * Math.sin(y * 53 + seed * 2) * Math.sin(z * 47 + seed * 3);
    p.setXYZ(i, x * n, y * n, z * n);
  }
  geo.computeVertexNormals();
  return geo;
}

function materialItem(id) {
  const g = new THREE.Group();
  switch (id) {
    case 'ridge-wood': {   // cane: three lengths, nodes ringed
      const m = mat(0xCDB27A, 0.62), nm = mat(0x9C8457, 0.7);
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Group();
        c.add(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.36, 10), m));
        for (const y of [-0.1, 0.06]) { const n = new THREE.Mesh(new THREE.TorusGeometry(0.0122, 0.0032, 6, 14), nm); n.rotation.x = Math.PI / 2; n.position.y = y + i * 0.02; c.add(n); }
        c.position.set((i - 1) * 0.026, 0, (i % 2) * 0.012);
        g.add(c);
      }
      g.rotation.z = -0.8;
      return { root: g, size: 0.3 };
    }
    case 'feather': {      // gull feather: a vane either side of the rachis, grey to the tip
      const s = new THREE.Shape();
      s.moveTo(0, -0.16); s.bezierCurveTo(0.05, -0.1, 0.055, 0.08, 0.008, 0.17); s.bezierCurveTo(-0.03, 0.1, -0.035, -0.08, 0, -0.16);
      const vane = new THREE.Mesh(new THREE.ShapeGeometry(s, 16), mat(0xE9E4D8, 0.8, 0, { side: THREE.DoubleSide }));
      const tip = new THREE.Mesh(new THREE.ShapeGeometry(s, 16), mat(0x6E6C70, 0.8, 0, { side: THREE.DoubleSide }));
      tip.scale.set(0.9, 0.32, 1); tip.position.set(0.001, 0.112, 0.001);
      const rach = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.003, 0.36, 6), mat(0xF4F0E6, 0.6));
      rach.position.y = -0.01;
      g.add(vane, tip, rach);
      g.rotation.set(0.3, 0.5, -0.7);
      return { root: g, size: 0.32 };
    }
    case 'obsidian': {     // a knapped flake: black glass, sharp facets
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), mat(0x141317, 0.12, 0.1));
      f.scale.set(1, 0.32, 0.62); f.rotation.set(0.5, 0.4, 0.2);
      g.add(f);
      return { root: g, size: 0.18 };
    }
    case 'wire': {         // cord: a hank of three turns
      const m = mat(0xB79D74, 0.88);
      for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.07 + i * 0.004, 0.007, 8, 32), m); t.rotation.set(Math.PI / 2 + i * 0.18, i * 0.3, 0); g.add(t); }
      g.rotation.x = -0.4;
      return { root: g, size: 0.2 };
    }
    case 'chillwater': {   // brine: a gourd, stoppered
      const pts = [[0, -0.1], [0.07, -0.08], [0.08, -0.03], [0.05, 0.02], [0.035, 0.05], [0.045, 0.09], [0.02, 0.13], [0.012, 0.15]].map(([r, y]) => new THREE.Vector2(r, y));
      g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 24), mat(0xC0A060, 0.55)));
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.03, 8), mat(0x5B4632, 0.8)); st.position.y = 0.16; g.add(st);
      return { root: g, size: 0.28 };
    }
    case 'blaze': {        // vent resin: an amber lump
      g.add(new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(0.065, 2), 0.18, 1.3), mat(0xA4561C, 0.28)));
      g.scale.set(1, 0.75, 1);
      return { root: g, size: 0.15 };
    }
    case 'sparker': {      // pumice dust: a tied pouch
      const pts = [[0, -0.07], [0.06, -0.06], [0.07, -0.02], [0.05, 0.03], [0.018, 0.06], [0.03, 0.08], [0.01, 0.09]].map(([r, y]) => new THREE.Vector2(r, y));
      g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 20), mat(0xD8D0C2, 0.95)));
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 6, 16), mat(0x8C6F4A, 0.85)); t.rotation.x = Math.PI / 2; t.position.y = 0.058; g.add(t);
      return { root: g, size: 0.18 };
    }
    case 'metal-shards': { // salt: a raked cone
      g.add(new THREE.Mesh(lumpy(new THREE.ConeGeometry(0.08, 0.1, 20, 3), 0.05, 2.1), mat(0xF1EEE6, 0.95)));
      return { root: g, size: 0.17 };
    }
    case 'echo-shell': {   // an escapement wheel, brass
      const m = mat(0xB08A45, 0.36, 0.85);
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 24), m);
      g.add(w);
      for (let i = 0; i < 15; i++) { const a = (i / 15) * Math.PI * 2; const t = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.012, 0.01), m); t.position.set(Math.cos(a) * 0.066, 0, Math.sin(a) * 0.066); t.rotation.y = -a + 0.5; g.add(t); }
      g.rotation.x = 1.1;
      return { root: g, size: 0.16 };
    }
    case 'clay': {
      g.add(new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.06, 16, 12), 0.12, 0.7), mat(0xA0583A, 0.9)));
      g.scale.set(1.2, 0.8, 1);
      return { root: g, size: 0.15 };
    }
    case 'pumice': {
      g.add(new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(0.06, 2), 0.2, 2.9), mat(0xBDB6AA, 1)));
      return { root: g, size: 0.14 };
    }
    case 'sinker': {       // a basalt sinker, bored for the line
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.026, 12, 24), mat(0x3B3A36, 0.7));
      t.rotation.x = 1.1; g.add(t);
      return { root: g, size: 0.14 };
    }
    default: {
      g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 1), mat(0x8A847A, 0.8)));
      return { root: g, size: 0.12 };
    }
  }
}

/* ------------------------------------------------------------------------ the renderer */

class Turntable {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'mk-tt';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pm.dispose();
    this.scene.add(new THREE.HemisphereLight(0xF2E6D0, 0x2A2236, 0.55));
    const key = new THREE.DirectionalLight(0xFFE2B8, 2.6); key.position.set(1.4, 1.8, 2.2); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xC9D2F0, 1.4); rim.position.set(-1.8, 0.9, -2.0); this.scene.add(rim);
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.02, 20);
    this.spin = new THREE.Group();
    this.scene.add(this.spin);
    this.items = new Map();
    this.icons = new Map();
    this.cur = null;
    this.raf = 0;
    this.w = 0; this.h = 0;
    this.t0 = performance.now();
    this.stats = { built: performance.now(), frames: 0, icons: 0 };
  }

  _item(key, build) {
    let it = this.items.get(key);
    if (!it) { it = build(); this.items.set(key, it); }
    return it;
  }

  /** The row's item: arrows by combat's ammo id, pots and the net by the row id. */
  itemFor(row) {
    if (row._it) return row._it;
    if (row.group === 'arrows') return this._item(`a:${row.ammo || 'hunter'}`, () => arrowItem(row.ammo || 'hunter'));
    if (row.group === 'pots') return this._item(`p:${row.id}`, () => potItem(row.id));
    return this._item('n', netItem);
  }

  _frame(size, aspect) {
    const d = (size * 0.62) / Math.tan((this.camera.fov * Math.PI) / 360) / Math.min(1, aspect);
    this.camera.aspect = aspect;
    this.camera.position.set(0, size * 0.12, d);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  _size(w, h) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w === this.w && h === this.h && this.dpr === dpr) return;
    this.w = w; this.h = h; this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
  }

  /** Put the item in `host` (a sized box) and turn it. */
  show(host, row) {
    if (this.canvas.parentNode !== host) host.appendChild(this.canvas);
    const it = this.itemFor(row);
    if (this.cur !== it) {
      if (this.cur) this.spin.remove(this.cur.root);
      this.spin.add(it.root);
      this.cur = it;
    }
    const still = document.body.classList.contains('cal-reduced-motion');
    const loop = () => {
      this.raf = 0;
      if (!this.canvas.isConnected) return;
      const r = host.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      this._size(w, h);
      this._frame(this.cur.size, w / h);
      this.spin.rotation.y = still ? 0.49 : (((performance.now() - this.t0) / 1000) / TURN_S) * Math.PI * 2;
      this.renderer.render(this.scene, this.camera);
      this.stats.frames++;
      if (!still && document.visibilityState !== 'hidden') this.raf = requestAnimationFrame(loop);
    };
    if (this.raf) cancelAnimationFrame(this.raf);
    loop();
  }

  /**
   * The satchel's detail column (M1.6g2, BIBLE 18 "detail column with a turntable"): any item by its catalogue id.
   * An arrow by combat's ammo id, the cinder pot, else the island material's own model (a plain stone where the
   * catalogue has none yet).
   */
  showId(host, id, ammo = false) {
    const row = ammo ? { group: 'arrows', ammo: id }
      : /pot|bomb/.test(String(id)) ? { group: 'pots', id: 'cinderPot' }
        : null;
    if (row) return this.show(host, row);
    const it = this._item(`m:${id}`, () => materialItem(id));
    return this.show(host, { group: '_m', _it: it });
  }

  hide() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.canvas.remove();
  }

  /** A material's picture (data URL, ICON_PX square, transparent), drawn once and cached. */
  icon(id) {
    let url = this.icons.get(id);
    if (url) return url;
    const it = materialItem(id);
    const hold = this.cur;
    if (hold) this.spin.remove(hold.root);
    this.spin.rotation.y = 0.5;
    this.spin.add(it.root);
    const w = this.w, h = this.h;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(ICON_PX, ICON_PX, false);
    this.dpr = 0;
    this._frame(it.size, 1);
    this.renderer.render(this.scene, this.camera);
    url = this.canvas.toDataURL('image/png');
    this.spin.remove(it.root);
    if (hold) this.spin.add(hold.root);
    if (w && h) this._size(w, h);
    this.icons.set(id, url);
    this.stats.icons++;
    return url;
  }
}

/** The one turntable (made on first use; null where there is no WebGL, e.g. Node). */
export function turntable() {
  if (shared) return shared;
  if (typeof document === 'undefined') return null;
  try { shared = new Turntable(); } catch { shared = null; }
  return shared;
}
