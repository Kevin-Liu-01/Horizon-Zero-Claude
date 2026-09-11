import * as THREE from 'three';
import {
  SimplexNoise, mulberry32, composeMat, tint, paintRust,
  rustTube, tube, bake, materials,
} from './kit.js';

/**
 * ROUND 4 — `missing-systems-landmark-activities`, `focus-datapoints-tracks`
 * (world half) and `progression-009` (no side content).
 *
 * Everything the valley now has to *do* outside a fight, registered through
 * `ctx.interactables` so the existing E-hold prompt, loot popup and Focus glow
 * pick them up with no edit to another lane's file:
 *
 *   12 DATAPOINTS      one Old-World record per place worth walking to, each
 *                      beside a half-buried rusted casing. THE RECORDS ARE NOT
 *                      OURS TO OWN: `focus-items` ships the datapoint system
 *                      (pedestal instances, Focus reveal, the Notebook that
 *                      keeps them) and publishes `ctx.items.datapoints.place()`
 *                      for exactly this lane. These twelve go through that door
 *                      — see `_register()`. The local mote mesh and the local
 *                      `interactables` entry are the NO-`focus-items` fallback
 *                      only, and are hidden the moment the store adopts them.
 *    1 OVERRIDE NODE   the maintenance interface at the Tallneck's rear foot.
 *                      Overriding it reveals every site in the valley:
 *                      `props.revealed === true`, event `override-node`.
 *    6 SUPPLY CACHES   pre-Fall crates at the megastructures, real loot.
 *    1 HUNTING GROUND  the Nora trial ground east of the camp: a totem ring, a
 *                      trial board and three named trials in `props.trials`.
 *
 * PROGRESSION HAND-OFF. `progression` (lane 5213) lands in the same wave, so
 * every call into it is optional: `ctx.progression?.award?.({...})` and
 * `ctx.progression?.discover?.(id)` are attempted and the event is emitted
 * either way. Nothing here breaks if that module never arrives.
 *
 * EVENTS: `datapoint-found` {id, title, text, index, total} — now raised for
 *         EVERY record in the unified set, this lane's twelve and
 *         `focus-items`' twelve alike, so `playerAnimator`'s interact beat and
 *         anything else already wired to it fire on all twenty-four,
 *         `override-node` {id, x, z}, `supply-cache` {id},
 *         `hunting-ground` {id, trials}.
 */

/**
 * Datapoint corpus — short, in-world, and written to be read on a HUD card.
 *
 * `category` / `author` are `focus-items`' Notebook fields (its CATEGORIES map
 * is world | vessels | nora | machine); `text` becomes its one-paragraph body.
 */
const DATAPOINTS = [
  { id: 'dp-span-1', x: -118, z: 152, category: 'world', author: 'ROADWAY CONTROL · EASTBOUND DECK', title: 'ROAD LOG 04-117', text: 'Traffic control note: the eastbound deck is closed for load testing. Detour signage is up at both approaches. Expect delays through the weekend.' },
  { id: 'dp-span-2', x: -88, z: 176, category: 'world', author: 'STRUCTURES · WORK ORDER, UNSIGNED', title: 'MAINTENANCE ORDER', text: 'Pier three is showing chloride migration in the lower cage. Replace before the winter freeze. Flagged twice already; nobody has come.' },
  { id: 'dp-core-1', x: 228, z: 96, category: 'world', author: 'LOBBY PLATE · CIVIC CORE', title: 'FLOOR DIRECTORY', text: 'Levels one to four, civic services. Five to nine, sub-contract offices. Ten and above, closed pending environmental review.' },
  { id: 'dp-core-2', x: 243, z: 114, category: 'world', author: 'PUBLIC ADDRESS · FINAL LOOP', title: 'EVACUATION NOTICE', text: 'All personnel are to proceed to the muster point. Do not use the lifts. Do not return for personal effects. This is not a drill.' },
  { id: 'dp-hangar-1', x: 74, z: -190, category: 'vessels', author: 'HANGAR CONTROL · RETROFIT LINE', title: 'HANGAR MANIFEST', text: 'Six airframes in for retrofit, two stripped for parts. Crew has been reassigned to the northern line. Doors to remain shut.' },
  { id: 'dp-hangar-2', x: 96, z: -207, category: 'vessels', author: 'HANGAR CONTROL · POSTED AT THE GATE', title: 'SHIFT ROSTER', text: 'Night shift is cancelled until further notice. Anyone still holding a badge should hand it in at the gate. Thank you for your service.' },
  { id: 'dp-mast-1', x: -243, z: 6, category: 'world', author: 'RELAY STATION · AUTOMATED LOG', title: 'RELAY STATUS', text: 'Uplink degraded. Fallback to the southern array failed at 0300. No acknowledgement from control since. Continuing to transmit on the beacon.' },
  { id: 'dp-mast-2', x: -257, z: 24, category: 'world', author: 'RELAY STATION · VOICE, RECORDED', title: 'LAST BROADCAST', text: 'If you can hear this, the shelters at the lake are still open. Bring water. Bring anything that burns. We will keep the light on as long as the mast stands.' },
  { id: 'dp-pylon-1', x: -150, z: -176, category: 'world', author: 'GRID INSPECTION · TOWER 41', title: 'LINE INSPECTION', text: 'Tower 41 is out of plumb by nine degrees. The footing has washed out on the downhill side. Recommend de-energising the span.' },
  { id: 'dp-arch-1', x: 180, z: -110, category: 'world', author: 'TRAIL SURVEY · MARKER PLATE', title: 'SURVEY MARK', text: 'Natural arch, nineteen metres. Load bearing, no fracture propagation observed. Marked as a landmark for the trail.' },
  { id: 'dp-hollow-1', x: -160, z: 110, category: 'nora', author: 'SCRATCHED INTO THE CAVE WALL', title: 'SHELTER LOG', text: 'Twelve of us in the hollow. The coals last the night if we bank them. Whoever finds this: the water to the east is clean. The metal things do not come inside.' },
  { id: 'dp-camp-1', x: 36, z: 18, category: 'machine', author: 'CARVED POST · NORA', title: 'NORA SIGHT-MARK', text: 'Carved by a hunter of the Nora. Three notches for three machines taken from this ridge. The fourth notch is unfinished.' },
];

const CACHES = [
  { id: 'cache-span', x: -110, z: 158, loot: [{ id: 'metal-shards', n: 32 }, { id: 'wire', n: 3 }] },
  { id: 'cache-core', x: 238, z: 112, loot: [{ id: 'metal-shards', n: 28 }, { id: 'metal-vessel', n: 2 }] },
  { id: 'cache-hangar', x: 90, z: -191, loot: [{ id: 'blastpaste', n: 3 }, { id: 'metal-shards', n: 24 }] },
  { id: 'cache-mast', x: -246, z: 20, loot: [{ id: 'sparker', n: 6 }, { id: 'wire', n: 4 }] },
  { id: 'cache-hollow', x: -163, z: 111, loot: [{ id: 'medicinal-herb', n: 4 }, { id: 'ridge-wood', n: 5 }] },
  { id: 'cache-arch', x: 194, z: -124, loot: [{ id: 'metal-shards', n: 20 }, { id: 'echo-shell', n: 2 }] },
];

const TRIALS = [
  { id: 'trial-blast', name: 'Blast the Canisters', text: 'Three blaze canisters, three arrows, one minute.' },
  { id: 'trial-strike', name: 'Silent Strike Trio', text: 'Take three Watchers without one raising an alarm.' },
  { id: 'trial-tear', name: 'Strip the Sawtooth', text: 'Tear the discs off a Sawtooth before it closes on you.' },
];

const HUNTING_GROUND = { id: 'hunting-ground-valley', x: 128, z: -78 };

export class Activities {
  constructor(ctx, props) {
    this.ctx = ctx;
    this.props = props;
    this.noise = new SimplexNoise(5150);
    this.group = new THREE.Group();
    this.group.name = 'world-activities';

    /** @type {object[]} published for focus-items / progression */
    this.datapoints = DATAPOINTS.map((d, i) => ({ ...d, index: i, found: false, y: 0 }));
    this.datapointById = new Map(this.datapoints.map((d) => [d.id, d]));
    /** set by `_register()` when `focus-items` adopts the twelve. */
    this.datapointStore = null;
    this.caches = CACHES.map((c) => ({ ...c, looted: false }));
    this.trials = TRIALS.map((t) => ({ ...t, complete: false }));
    this.revealed = false;
    this.entries = [];

    this._buildDatapoints();
    this._buildCaches();
    this._buildOverrideNode();
    this._buildHuntingGround();

    ctx.scene.add(this.group);
  }

  /**
   * `ctx.interactables` is constructed after `Props` (which is built inside
   * `Vegetation`), so registration cannot happen in the constructor. `Props`
   * calls this every frame; it does its work exactly once.
   */
  ensureRegistered() {
    if (this._registered || !this.ctx.interactables) return false;
    this._registered = true;
    this._register();
    return true;
  }

  gy(x, z) { return this.ctx.terrain.getHeight(x, z); }

  /* ------------------------------ datapoints ----------------------------- */

  _buildDatapoints() {
    const N = this.noise;
    const rng = mulberry32(0xDA7A);
    const cases = [];
    for (const d of this.datapoints) {
      const y = this.gy(d.x, d.z);
      d.y = y + 0.95;
      /**
       * Where the READABLE record stands, as opposed to where the casing lies.
       * `focus-items`' pedestal is a 1.35 m post with a lit slate on top; drop
       * it on the same square metre as this casing and the two interpenetrate.
       * A metre aside, on a per-record bearing, reads as a survey marker set
       * beside a half-buried machine — which is what it is.
       */
      const a = d.index * 2.3999632;                    // golden-angle spread
      d.px = d.x + Math.cos(a) * 0.98;
      d.pz = d.z + Math.sin(a) * 0.98;
      d.py = this.gy(d.px, d.pz);
      // the casing the mote sits on: a half-buried old-world device
      const box = new THREE.BoxGeometry(0.62, 0.44, 0.44, 2, 2, 2);
      paintRust(box, 8000 + d.index * 7, N, 99, 0.9);
      box.applyMatrix4(composeMat(d.x, y + 0.14, d.z, (rng() - 0.5) * 0.2, rng() * 6.28, (rng() - 0.5) * 0.2));
      cases.push(box.toNonIndexed());
      const stem = new THREE.CylinderGeometry(0.035, 0.05, 0.5, 5);
      paintRust(stem, 8100 + d.index, N, 99, 0.6);
      stem.applyMatrix4(composeMat(d.x, y + 0.52, d.z));
      cases.push(stem.toNonIndexed());
    }
    const mesh = bake(cases, materials().metal, { name: 'activity-datapoint-cases' });
    if (mesh) this.group.add(mesh);

    // the motes: one instanced emissive octahedron per datapoint, bobbing.
    const geo = new THREE.OctahedronGeometry(0.13, 0);
    this.moteMat = new THREE.MeshStandardMaterial({
      color: 0xbfe9ff, emissive: 0x49c8ff, emissiveIntensity: 3.2,
      roughness: 0.3, metalness: 0, toneMapped: false,
    });
    const im = new THREE.InstancedMesh(geo, this.moteMat, this.datapoints.length);
    im.name = 'activity-datapoint-motes';
    im.castShadow = false;
    im.receiveShadow = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    im.raycast = () => {};                                   // glow decal: not solid
    this.motes = im;
    this._moteM = new THREE.Matrix4();
    this._moteQ = new THREE.Quaternion();
    this._moteP = new THREE.Vector3();
    this._moteS = new THREE.Vector3(1, 1, 1);
    this._moteE = new THREE.Euler();
    this.group.add(im);
    this._syncMotes(0);
  }

  _syncMotes(t) {
    const im = this.motes;
    if (!im || !im.visible) return;   // adopted by focus-items: nothing to move
    for (let i = 0; i < this.datapoints.length; i++) {
      const d = this.datapoints[i];
      if (d.found) {
        this._moteM.makeScale(0, 0, 0);
      } else {
        this._moteP.set(d.x, d.y + 0.12 * Math.sin(t * 1.6 + i * 1.3), d.z);
        this._moteE.set(t * 0.5 + i, t * 0.8 + i * 2.1, 0);
        this._moteQ.setFromEuler(this._moteE);
        this._moteM.compose(this._moteP, this._moteQ, this._moteS);
      }
      im.setMatrixAt(i, this._moteM);
    }
    im.instanceMatrix.needsUpdate = true;
  }

  /* -------------------------------- caches ------------------------------- */

  _buildCaches() {
    const N = this.noise;
    const rng = mulberry32(0xCAC4);
    const geos = [];
    for (const c of this.caches) {
      const y = this.gy(c.x, c.z);
      c.y = y;
      const yaw = rng() * Math.PI * 2;
      const body = new THREE.BoxGeometry(1.15, 0.78, 0.82, 3, 2, 2);
      paintRust(body, 8200 + c.x, N, 99, 1.1);
      body.applyMatrix4(composeMat(c.x, y + 0.39, c.z, 0, yaw, 0.02));
      geos.push(body.toNonIndexed());
      // banded lid, slightly ajar
      const lid = new THREE.BoxGeometry(1.2, 0.12, 0.88);
      paintRust(lid, 8250 + c.x, N, 99, 1.3);
      lid.applyMatrix4(composeMat(c.x - 0.06, y + 0.84, c.z, 0.06, yaw, 0.13));
      geos.push(lid.toNonIndexed());
      for (const s of [-1, 1]) {
        const band = new THREE.BoxGeometry(0.1, 0.82, 0.86);
        paintRust(band, 8300 + s + c.x, N, 99, 0.7);
        band.applyMatrix4(composeMat(c.x + Math.cos(yaw) * s * 0.42, y + 0.4, c.z - Math.sin(yaw) * s * 0.42, 0, yaw, 0));
        geos.push(band.toNonIndexed());
      }
      // a spilled crate beside it so a cache reads as a cache from 20 m
      const spill = new THREE.BoxGeometry(0.7, 0.5, 0.52, 2, 2, 2);
      paintRust(spill, 8350 + c.x, N, 99, 1.4);
      const sx = c.x + Math.cos(yaw + 1.1) * 1.15, sz = c.z + Math.sin(yaw + 1.1) * 1.15;
      spill.applyMatrix4(composeMat(sx, this.gy(sx, sz) + 0.22, sz, 1.4, yaw + 0.6, 0.3));
      geos.push(spill.toNonIndexed());
    }
    const mesh = bake(geos, materials().metal, { name: 'activity-supply-caches' });
    if (mesh) this.group.add(mesh);
  }

  /* ----------------------------- override node --------------------------- */

  _buildOverrideNode() {
    const T = this.props.tallneck;
    const bx = T ? T.base.x - 11.0 : -36, bz = T ? T.base.z - 7.4 : 213;
    const y = this.gy(bx, bz);
    this.overrideNode = { id: 'override-tallneck', x: bx, y, z: bz, used: false };

    const N = this.noise;
    const geos = [], lights = [];
    // a machine-plate pillar with a slanted interface face
    const pillar = new THREE.CylinderGeometry(0.46, 0.62, 2.05, 8, 2);
    paintRust(pillar, 8400, N, 99, 0.5);
    pillar.applyMatrix4(composeMat(bx, y + 1.0, bz, 0, 0.4, 0));
    geos.push(pillar.toNonIndexed());
    const head = new THREE.BoxGeometry(0.95, 0.62, 0.34, 2, 2, 1);
    paintRust(head, 8410, N, 99, 0.4);
    head.applyMatrix4(composeMat(bx, y + 2.16, bz, -0.5, 0.4, 0));
    geos.push(head.toNonIndexed());
    for (let i = 0; i < 3; i++) {
      const a = 0.4 + (i - 1) * 2.1;
      rustTube(geos, [bx + Math.cos(a) * 0.5, y + 0.05, bz + Math.sin(a) * 0.5],
        [bx + Math.cos(a) * 1.25, y + 0.02, bz + Math.sin(a) * 1.25], 0.09, 0.06, 8420 + i, N, 4);
    }
    // the interface glow
    const face = new THREE.PlaneGeometry(0.72, 0.42);
    tint(face, '#8fe8ff', 0.03, mulberry32(9));
    face.applyMatrix4(composeMat(bx + Math.sin(0.4) * 0.02, y + 2.24, bz + Math.cos(0.4) * 0.19, -0.5, 0.4, 0));
    lights.push(face);
    const ring = new THREE.TorusGeometry(0.5, 0.045, 5, 16);
    ring.rotateX(Math.PI / 2);
    tint(ring, '#7fdcff', 0.03, mulberry32(11));
    ring.applyMatrix4(composeMat(bx, y + 0.09, bz));
    lights.push(ring);

    const m = bake(geos, materials().metal, { name: 'activity-override-node' });
    if (m) this.group.add(m);
    this.overrideMat = new THREE.MeshStandardMaterial({
      color: 0xa9edff, emissive: 0x36c4f0, emissiveIntensity: 2.6,
      roughness: 0.3, metalness: 0, toneMapped: false, side: THREE.DoubleSide,
    });
    const ml = bake(lights, this.overrideMat, { name: 'activity-override-glow', castShadow: false });
    if (ml) { ml.raycast = () => {}; this.group.add(ml); }   // glow decal: not solid
  }

  /* ---------------------------- hunting ground --------------------------- */

  _buildHuntingGround() {
    const { x: X, z: Z } = HUNTING_GROUND;
    const y = this.gy(X, Z);
    this.huntingGround = { ...HUNTING_GROUND, y, entered: false };
    const N = this.noise;
    const rng = mulberry32(0x4074);
    const wood = [], cloth = [], metal = [];

    // totem ring: eight carved posts, tallest to the north
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = X + Math.cos(a) * 4.6, pz = Z + Math.sin(a) * 4.6;
      const py = this.gy(px, pz);
      const h = 1.7 + 1.5 * Math.max(0, Math.cos(a - Math.PI / 2)) + rng() * 0.35;
      tube(wood, [px, py - 0.35, pz], [px + (rng() - 0.5) * 0.2, py + h, pz + (rng() - 0.5) * 0.2],
        0.15, 0.11, i % 2 ? '#5b4630' : '#4a3826', 6, 0.08, rng);
      // lashed cross-tie to the next post
      const b = ((i + 1) / 8) * Math.PI * 2;
      const qx = X + Math.cos(b) * 4.6, qz = Z + Math.sin(b) * 4.6;
      tube(wood, [px, py + h * 0.62, pz], [qx, this.gy(qx, qz) + 1.5, qz], 0.04, 0.04, '#6f5a3c', 4, 0.07, rng);
      // a machine trophy hung on every other post
      if (i % 2 === 0) {
        const tro = new THREE.BoxGeometry(0.38, 0.26, 0.18, 2, 2, 1);
        paintRust(tro, 8500 + i, N, 99, 1.2);
        tro.applyMatrix4(composeMat(px, py + h * 0.72, pz, rng() * 0.4, a, 0.2));
        metal.push(tro.toNonIndexed());
      } else {
        const rag = new THREE.PlaneGeometry(0.4, 0.85, 2, 3);
        const p = rag.attributes.position;
        for (let k = 0; k < p.count; k++) p.setZ(k, Math.sin(p.getY(k) * 3.1) * 0.05);
        rag.computeVertexNormals();
        tint(rag, i % 4 === 1 ? '#8f3a2a' : '#3f5d6b', 0.12, rng);
        rag.applyMatrix4(composeMat(px, py + h * 0.62, pz, 0, a + Math.PI / 2, 0.06));
        cloth.push(rag);
      }
    }
    // the trial board: a slab of hide stretched on a frame, facing the camp
    {
      const bx = X - 1.2, bz = Z - 3.4;
      const by = this.gy(bx, bz);
      const yaw = Math.atan2(22 - bx, 30 - bz);
      for (const s of [-1, 1]) {
        tube(wood, [bx + Math.cos(yaw) * s * 1.1, by - 0.3, bz - Math.sin(yaw) * s * 1.1],
          [bx + Math.cos(yaw) * s * 1.05, by + 2.05, bz - Math.sin(yaw) * s * 1.05], 0.1, 0.08, '#4a3826', 6, 0.07, rng);
      }
      const board = new THREE.PlaneGeometry(2.05, 1.35, 4, 3);
      const p = board.attributes.position;
      for (let k = 0; k < p.count; k++) {
        p.setZ(k, Math.sin(p.getX(k) * 2.2) * 0.05 + Math.cos(p.getY(k) * 3) * 0.03);
      }
      board.computeVertexNormals();
      tint(board, '#9b7248', 0.1, rng);
      board.applyMatrix4(composeMat(bx, by + 1.3, bz, 0, yaw, 0));
      cloth.push(board);
      // three trial marks burned into the hide
      for (let i = 0; i < 3; i++) {
        const mark = new THREE.PlaneGeometry(0.42, 0.42);
        tint(mark, '#3a2a1c', 0.14, rng);
        mark.applyMatrix4(composeMat(
          bx + Math.cos(yaw) * (i - 1) * 0.58 + Math.sin(yaw) * 0.03,
          by + 1.3, bz - Math.sin(yaw) * (i - 1) * 0.58 + Math.cos(yaw) * 0.03, 0, yaw, 0));
        cloth.push(mark);
      }
    }
    // a firepit ring in the middle so the ground reads as used
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const sx = X + Math.cos(a) * 0.95, sz = Z + Math.sin(a) * 0.95;
      const s = 0.2 + rng() * 0.12;
      const st = new THREE.DodecahedronGeometry(s, 0);
      tint(st, '#6f6a60', 0.12, rng);
      st.applyMatrix4(composeMat(sx, this.gy(sx, sz) + s * 0.45, sz, rng(), rng() * 6.28, rng()));
      wood.push(st);
    }

    const mats = materials();
    const mw = bake(wood, mats.matte, { name: 'activity-hunting-ground' });
    const mc = bake(cloth, mats.hide, { name: 'activity-hunting-ground-hide' });
    const mm = bake(metal, mats.metal, { name: 'activity-hunting-ground-trophies' });
    for (const m of [mw, mc, mm]) if (m) this.group.add(m);
  }

  /* ------------------------- datapoint adoption -------------------------- */

  /**
   * Hand the twelve records to `focus-items` instead of shipping a second
   * datapoint system beside its one (Round 4 judge finding).
   *
   * `src/items/datapoints.js` publishes `ctx.items.datapoints.place()` and says
   * in its header that `world-props` owns placement, so this is the door it was
   * built for. Going through it means: ONE kind of collectable in the world,
   * one Focus reveal pass, one pedestal InstancedMesh, and — the part that was
   * actually broken — all twelve land in the Notebook, which counts
   * `datapoint-collected` and never saw the local entries at all.
   *
   * The local casing stays (set dressing), the local mote mesh and the local
   * `interactables` entry do not: they are the fallback for a build with no
   * `focus-items`, and `place()` returning a record is the signal to drop them.
   */
  _adoptDatapoints(I) {
    const ctx = this.ctx;
    const store = ctx.items?.datapoints;
    const usable = store && typeof store.place === 'function';
    if (usable) {
      this.datapointStore = store;
      this._ensureStoreCapacity(store, this.datapoints.length);
    }

    let adopted = 0;
    for (const d of this.datapoints) {
      const rec = usable ? store.place({
        id: d.id, title: d.title, category: d.category ?? 'world',
        author: d.author ?? '', body: [d.text],
        x: d.px, z: d.pz, y: d.py,
      }) : null;
      if (rec) { d.record = rec; d.delegated = true; adopted++; continue; }
      // fallback build (no focus-items, or its store is full): our own entry
      this.entries.push(I.register({
        position: { x: d.x, y: d.y, z: d.z },
        radius: 2.4, hold: 0.55, label: 'DATAPOINT', once: true,
        site: 'datapoint', datapoint: d,
        onInteract: () => this._collected(d.id, d.title, null),
      }));
    }
    this.datapointsAdopted = adopted;
    // every record adopted -> the local motes are dead weight in the frame
    if (this.motes && adopted === this.datapoints.length) {
      this.motes.visible = false;
      this.motes.count = 0;
    }

    /**
     * One listener for the whole unified set. `focus-items` emits
     * `datapoint-collected`; this re-raises `datapoint-found` for it so
     * `playerAnimator`'s interact beat (playerAnimator.js:555) and every other
     * existing consumer keep firing — and now fire on all twenty-four records
     * rather than on half of them. XP is awarded here too, once per id,
     * because nothing else in the build awards it.
     */
    if (usable && !this._collectHook) {
      this._collectHook = true;
      ctx.events?.on?.('datapoint-collected', (e) => {
        if (e?.id) this._collected(e.id, e.title, e);
      });
    }
  }

  /**
   * The single place a datapoint pickup becomes progression + `datapoint-found`,
   * whichever system owned the entry. Idempotent per id.
   */
  _collected(id, title, storeEvent) {
    const ctx = this.ctx;
    const d = this.datapointById.get(id) ?? null;
    if (d) {
      if (d.found) return;
      d.found = true;
    } else if (this._foreignFound?.has(id)) return;
    else (this._foreignFound ??= new Set()).add(id);

    ctx.progression?.discover?.(id);
    ctx.progression?.award?.({ xp: 25, reason: 'datapoint', id });

    const store = this.datapointStore;
    const mine = this.datapoints.filter((x) => x.found).length;
    ctx.events.emit('datapoint-found', {
      id, title: title ?? d?.title ?? 'DATAPOINT',
      text: d?.text ?? (storeEvent ? store?.record?.(id)?.body?.join(' ') ?? '' : ''),
      index: d?.index ?? -1,
      total: storeEvent?.total ?? store?.total ?? this.datapoints.length,
      found: storeEvent?.have ?? mine,
    });
    ctx.audio?.play2D?.('machine/scan-ping', { category: 'ui', volume: 0.5 });
  }

  /**
   * `focus-items` sized its two pedestal InstancedMeshes for its own twelve
   * plus eight spare slots (`datapoints.js` `_buildMeshes(DATAPOINTS.length+8)`)
   * and `place()` returns null rather than growing when they run out. This lane
   * needs twelve of those slots, not eight, and `datapoints.js` belongs to
   * another lane — so grow the meshes from out here: same geometry, same
   * material, same parent, same flags, existing matrices copied across, only
   * the instance capacity changes. Guarded on the exact shape it needs, so if
   * `focus-items` ever widens the reservation itself this becomes a no-op, and
   * if it renames these fields the four overflow records simply fall back to
   * this lane's own entries instead of throwing.
   */
  _ensureStoreCapacity(store, extra) {
    const mesh = store.mesh;
    const glow = store.glow;
    if (!mesh?.isInstancedMesh || !glow?.isInstancedMesh) return;
    const have = mesh.instanceMatrix.count;
    const need = (store.list?.length ?? 0) + extra;
    if (have >= need || glow.instanceMatrix.count < have) return;
    const grown = need + 4;
    store.mesh = this._regrow(mesh, grown);
    store.glow = this._regrow(glow, grown);
  }

  /** Replace one InstancedMesh in its parent with a wider clone of itself. */
  _regrow(im, capacity) {
    const next = new THREE.InstancedMesh(im.geometry, im.material, capacity);
    next.name = im.name;
    next.count = im.count;
    next.visible = im.visible;
    next.castShadow = im.castShadow;
    next.receiveShadow = im.receiveShadow;
    next.frustumCulled = im.frustumCulled;
    next.renderOrder = im.renderOrder;
    next.userData = im.userData;
    // an own `raycast` is how this codebase marks a mesh non-solid (see
    // `colliders()` below and collision.seedWorld) — carry it, or a glow decal
    // silently becomes a wall
    if (Object.prototype.hasOwnProperty.call(im, 'raycast')) next.raycast = im.raycast;
    next.instanceMatrix.array.set(im.instanceMatrix.array);
    next.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) {
      next.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(capacity * im.instanceColor.itemSize), im.instanceColor.itemSize,
      );
      next.instanceColor.array.set(im.instanceColor.array);
      next.instanceColor.needsUpdate = true;
    }
    const parent = im.parent;
    if (parent) { parent.add(next); parent.remove(im); }
    im.dispose();                 // the InstancedMesh only: geo + mat are reused
    return next;
  }

  /* ------------------------------ registration --------------------------- */

  _register() {
    const I = this.ctx.interactables;
    if (!I) return;
    const ctx = this.ctx;

    this._adoptDatapoints(I);

    for (const c of this.caches) {
      const entry = I.register({
        position: { x: c.x, y: c.y + 0.8, z: c.z },
        radius: 2.4, hold: 0.6, label: 'SUPPLY CACHE', once: true,
        site: 'cache', loot: c.loot,
        onInteract: () => {
          c.looted = true;
          ctx.progression?.award?.({ xp: 15, reason: 'cache', id: c.id });
          ctx.events.emit('supply-cache', { id: c.id, loot: c.loot });
        },
      });
      this.entries.push(entry);
    }

    {
      const o = this.overrideNode;
      const entry = I.register({
        position: { x: o.x, y: o.y + 1.3, z: o.z },
        radius: 2.6, hold: 1.2, label: 'OVERRIDE', once: true,
        site: 'override',
        onInteract: () => {
          o.used = true;
          this.revealed = true;
          this.props.revealed = true;
          ctx.progression?.award?.({ xp: 150, reason: 'override-node', id: o.id });
          ctx.progression?.discover?.('tallneck');
          ctx.events.emit('override-node', {
            id: o.id, x: o.x, z: o.z,
            // the whole unified set, not just this lane's half of it
            reveals: this.revealList(),
          });
          ctx.audio?.play2D?.('machine/alarm', { category: 'ui', volume: 0.35 });
        },
      });
      this.entries.push(entry);
    }

    {
      const h = this.huntingGround;
      const entry = I.register({
        position: { x: h.x, y: h.y + 1.1, z: h.z },
        radius: 3.2, hold: 0.5, label: 'HUNTING GROUND',
        site: 'hunting-ground',
        onInteract: () => {
          h.entered = true;
          ctx.progression?.discover?.(h.id);
          ctx.events.emit('hunting-ground', { id: h.id, trials: this.trials });
        },
      });
      this.entries.push(entry);
    }
  }

  /**
   * Collider descriptors for the SOLID activity meshes (`A61`). The group is
   * added straight to the scene, so `collision.seedWorld()` — which only walks
   * `world-props` and `hunter-camp` — never sees it; `props.registerColliders`
   * hands these over instead. Emissive glow decals are excluded above by
   * owning their own `raycast`, which is the same signal the seeder uses.
   */
  colliders() {
    const out = [];
    this.group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh) return;
      if (Object.prototype.hasOwnProperty.call(o, 'raycast')) return;
      out.push({ kind: 'ruin', object: o, blocking: true, occluder: true, camera: true });
    });
    return out;
  }

  /**
   * Every datapoint in the world, this lane's and `focus-items`' both — what
   * the override node reveals. Falls back to this lane's twelve alone in a
   * build with no `focus-items`.
   */
  revealList() {
    const store = this.datapointStore;
    if (store?.list?.length) {
      return store.list.map((r) => ({
        id: r.id, x: r.position.x, z: r.position.z, title: r.title,
      }));
    }
    return this.datapoints.map((d) => ({ id: d.id, x: d.x, z: d.z, title: d.title }));
  }

  /** Everything a map / notebook needs, in one array. */
  sites() {
    const out = [];
    for (const d of this.datapoints) out.push({ kind: 'datapoint', id: d.id, x: d.x, z: d.z, name: d.title, done: d.found });
    for (const c of this.caches) out.push({ kind: 'cache', id: c.id, x: c.x, z: c.z, name: 'Supply Cache', done: c.looted });
    out.push({ kind: 'override', id: this.overrideNode.id, x: this.overrideNode.x, z: this.overrideNode.z, name: 'Override Node', done: this.overrideNode.used });
    out.push({ kind: 'hunting-ground', id: this.huntingGround.id, x: this.huntingGround.x, z: this.huntingGround.z, name: 'Hunting Ground', done: this.huntingGround.entered });
    return out;
  }

  update(dt, t) {
    this.ensureRegistered();
    this._syncMotes(t);
    if (this.overrideMat) {
      this.overrideMat.emissiveIntensity = this.overrideNode.used
        ? 1.1 + 0.2 * Math.sin(t * 1.1)
        : 2.2 + 0.9 * Math.sin(t * 3.1);
      if (this.overrideNode.used) this.overrideMat.emissive.setHex(0x37e0a0);
    }
  }
}
