import * as THREE from 'three';

/**
 * DATAPOINTS + NOTEBOOK  —  lane `focus-items` (port 5212)
 * ===========================================================================
 * Closes `missing-systems-focus-datapoints` (the `focus-items` half):
 * twelve collectable Old-World records scattered across the valley, revealed
 * by Focus with a labelled beacon, read in a Notebook pocket that keeps them.
 *
 * `world-props` owns landmark placement, so this module publishes a
 * registration API rather than assuming where anything is:
 *
 *     ctx.items.datapoints.place({ id, title, category, body, x, z, y? })
 *
 * Anything registered that way joins the Notebook and the Focus reveal pass
 * exactly like the twelve shipped here. Ids are idempotent — re-placing an id
 * moves the existing record instead of duplicating it.
 *
 * PUBLISHED (`ctx.items.datapoints`)
 *   list            -> [record]           every placed record
 *   collected       -> Set<id>
 *   count / total   -> numbers for the HUD / Notebook header
 *   categories()    -> [{ id, label, have, total }]
 *   record(id)      -> record | null
 *   collect(id)     -> bool               (emits 'datapoint-collected')
 *   place(def)      -> record             (world-props / progression hook)
 *   serialize() / deserialize(d)          (progression's save calls these if
 *                                          it wants them; nothing breaks if
 *                                          it never does)
 *
 * EVENTS
 *   'datapoint-collected' { id, title, category, have, total }
 *
 * The pedestal mesh is ONE InstancedMesh (2 draw calls: shell + glow), never
 * per-record materials, and the update loop only writes a single shared
 * emissive colour per frame.
 */

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);

export const CATEGORIES = {
  world:   'WORLD',
  vessels: 'ANCIENT VESSELS',
  nora:    'NORA RECORDS',
  machine: 'MACHINE STUDIES',
};

/**
 * The twelve. Positions are on the valley floor inside the 315 m playable
 * radius; the terrain heightfield supplies Y at build time.
 *
 * Written as fragments of found record, never as UI instructions — a
 * datapoint the player has to interpret is the whole point of the collectible.
 */
export const DATAPOINTS = [
  {
    id: 'dp-survey-01', category: 'world', x: 46, z: -62,
    title: 'Valley Survey — Sheet 1',
    author: 'FARO AUTOMATED SOLUTIONS · SITE PREP',
    body: [
      'Grade survey complete for the north bowl. Rim relief is steeper than '
      + 'the contract assumed; the access road will need two switchbacks or a '
      + 'cut we are not funded for.',
      'Recommend we take the cut. Nobody is going to be walking up here in '
      + 'fifty years anyway.',
    ],
  },
  {
    id: 'dp-survey-02', category: 'world', x: -118, z: 84,
    title: 'Valley Survey — Sheet 4',
    author: 'FARO AUTOMATED SOLUTIONS · SITE PREP',
    body: [
      'Water table sits higher on the west side than the maps show. Anything '
      + 'we sink below eight metres here fills within a season.',
      'Flagging the whole western meadow as unsuitable for permanent works. '
      + 'Surface installations only.',
    ],
  },
  {
    id: 'dp-vessel-01', category: 'vessels', x: 168, z: -24,
    title: 'Hull Fragment Log',
    author: 'RECOVERED — PARTIAL',
    body: [
      'We put down hard and we put down wrong. Starboard frame is open to the '
      + 'sky and the reactor scrammed on impact, which is the only reason '
      + 'anyone is writing this.',
      'Eleven walking. Four not. We are cutting the seat rails out for '
      + 'stretchers and heading for the ridge line at first light.',
    ],
  },
  {
    id: 'dp-vessel-02', category: 'vessels', x: -186, z: -138,
    title: 'Cargo Manifest, Amended',
    author: 'RECOVERED — PARTIAL',
    body: [
      'Amended en route. Half the listed mass was never loaded. Whoever signed '
      + 'the original manifest signed for crates of ballast.',
      'If you are reading this and you were counting on the medical pallets: '
      + 'they are not here. They were never here.',
    ],
  },
  {
    id: 'dp-nora-01', category: 'nora', x: 24, z: 58,
    title: 'A Hunter Counts Her Arrows',
    author: 'CARVED TABLET · NORA',
    body: [
      'Sixteen shafts is a hunt. Twelve is a careful hunt. Eight and you are '
      + 'walking home to make more, and you will make them badly, because you '
      + 'will be angry.',
      'Count them before you leave. Count them again at the ridge. Count them '
      + 'when you think you are done.',
    ],
  },
  {
    id: 'dp-nora-02', category: 'nora', x: -64, z: 148,
    title: 'What the Watchers Are For',
    author: 'CARVED TABLET · NORA',
    body: [
      'They do not hunt. They look, and then something else hunts. Kill the '
      + 'looker first and the valley stays quiet for an hour.',
      'A girl I trained with used to say the eye is the whole machine and the '
      + 'legs are just how the eye gets around. She was right, and she is '
      + 'still alive, which is the part that matters.',
    ],
  },
  {
    id: 'dp-nora-03', category: 'nora', x: 132, z: 176,
    title: 'On Trading With Outlanders',
    author: 'CARVED TABLET · NORA',
    body: [
      'They will weigh your shards and tell you the weight is short. Let them. '
      + 'Then ask what a Sawtooth heart is worth and watch the scale get '
      + 'honest.',
      'Never bring your whole satchel to a stall. Bring half. Come back for '
      + 'the rest at their price, not yours.',
    ],
  },
  {
    id: 'dp-machine-01', category: 'machine', x: 96, z: 112,
    title: 'Field Notes — Grazers and Striders',
    author: 'HUNTER’S JOURNAL',
    body: [
      'The herd machines carry blaze in a sac behind the shoulder. Put an '
      + 'arrow through it and the whole animal goes up, and so does anything '
      + 'standing next to it, including you.',
      'Shoot from upwind and downhill. Then walk away for a count of ten '
      + 'before you go collect.',
    ],
  },
  {
    id: 'dp-machine-02', category: 'machine', x: -142, z: 22,
    title: 'Field Notes — On Tearing',
    author: 'HUNTER’S JOURNAL',
    body: [
      'Everything bolted to the outside of a machine can come off. The trick '
      + 'is that a torn part keeps working until it hits the ground — so tear '
      + 'the thing that is pointed at you, not the thing that looks expensive.',
      'A disc launcher on the ground is worth more than a disc launcher on '
      + 'the machine. Obviously. Say it out loud anyway, in the moment, '
      + 'because in the moment you will forget.',
    ],
  },
  {
    id: 'dp-machine-03', category: 'machine', x: 202, z: 96,
    title: 'Field Notes — The Big One',
    author: 'HUNTER’S JOURNAL',
    body: [
      'Two launchers on the shoulders, a mouth like a rockfall, and a tail '
      + 'that will take your legs off at the knee from further away than you '
      + 'think. There is no clever way in.',
      'Take the launchers. Use them on it. That is the whole plan and it is '
      + 'the only plan that has ever worked.',
    ],
  },
  {
    id: 'dp-world-03', category: 'world', x: -28, z: -184,
    title: 'Automated Notice · Perimeter',
    author: 'SITE SYSTEMS — LOOPING',
    body: [
      'Perimeter integrity nominal. Perimeter integrity nominal. Perimeter '
      + 'integrity nominal.',
      'Last human acknowledgement: nine hundred and eighty-one years ago. '
      + 'Perimeter integrity nominal.',
    ],
  },
  {
    id: 'dp-world-04', category: 'world', x: 178, z: -168,
    title: 'Someone Was Here',
    author: 'SCRATCHED INTO THE HOUSING',
    body: [
      'Four of us came down the north rim. The tower still had power and we '
      + 'thought that meant something.',
      'It meant the tower still had power.',
    ],
  },
];

export class Datapoints {
  constructor(ctx, interactables) {
    this.ctx = ctx;
    this.interactables = interactables;

    this.list = [];
    this.byId = new Map();
    this.collected = new Set();

    this.group = new THREE.Group();
    this.group.name = 'datapoints';
    ctx.scene.add(this.group);

    this._buildMeshes(DATAPOINTS.length + 8); // headroom for world-props
    for (const def of DATAPOINTS) this.place(def);
  }

  get count() { return this.collected.size; }
  get total() { return this.list.length; }

  record(id) { return this.byId.get(id) ?? null; }

  categories() {
    const out = [];
    for (const [id, label] of Object.entries(CATEGORIES)) {
      const rows = this.list.filter((r) => r.category === id);
      if (!rows.length) continue;
      out.push({
        id, label, total: rows.length,
        have: rows.filter((r) => this.collected.has(r.id)).length,
      });
    }
    return out;
  }

  /* ---------------------------------------------------------------- mesh */

  _buildMeshes(capacity) {
    // one shell + one glow slate, instanced: 2 draw calls for the whole set
    // 1.35 m to the slate: world-ground's grass cards stand ~1 m, and a
    // shorter pedestal disappeared into them even with Focus on
    const post = new THREE.CylinderGeometry(0.08, 0.12, 1.22, 7);
    post.translate(0, 0.61, 0);
    const base = new THREE.CylinderGeometry(0.26, 0.34, 0.12, 7);
    base.translate(0, 0.06, 0);
    const head = new THREE.BoxGeometry(0.4, 0.3, 0.08);
    head.translate(0, 1.33, 0);
    head.rotateX(-0.32);
    const shellGeo = mergeSimple([base, post, head]);

    const shellMat = new THREE.MeshStandardMaterial({
      color: 0x6d7480, metalness: 0.72, roughness: 0.44,
    });
    this.mesh = new THREE.InstancedMesh(shellGeo, shellMat, capacity);
    this.mesh.name = 'datapoint-pedestals';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    const slate = new THREE.PlaneGeometry(0.3, 0.21);
    slate.translate(0, 1.335, 0.046);
    slate.rotateX(-0.32);
    this._glowBase = new THREE.Color(0.30, 1.55, 2.20); // Focus cyan, bloom-hot
    this._glowMat = new THREE.MeshBasicMaterial({
      toneMapped: false, side: THREE.DoubleSide, transparent: true, opacity: 0.95,
    });
    this._glowMat.color.copy(this._glowBase);
    this.glow = new THREE.InstancedMesh(slate, this._glowMat, capacity);
    this.glow.name = 'datapoint-slates';
    this.glow.count = 0;
    this.glow.frustumCulled = false;

    this.group.add(this.mesh, this.glow);
  }

  /* --------------------------------------------------------------- place */

  /**
   * Register (or move) one record. `world-props` calls this for anything it
   * wants readable; the twelve shipped records go through the same door.
   */
  place(def) {
    if (!def?.id) return null;
    const terrain = this.ctx.terrain;
    const x = def.x ?? 0;
    const z = def.z ?? 0;
    const y = def.y ?? (terrain?.getHeight?.(x, z) ?? 0);

    let rec = this.byId.get(def.id);
    if (!rec) {
      if (this.list.length >= this.mesh.instanceMatrix.count) return null;
      rec = {
        id: def.id, index: this.list.length,
        position: new THREE.Vector3(x, y, z),
        entry: null,
      };
      this.list.push(rec);
      this.byId.set(def.id, rec);
    }
    rec.title = def.title ?? 'RECORD';
    rec.category = def.category ?? 'world';
    rec.categoryLabel = CATEGORIES[rec.category] ?? 'RECORD';
    rec.author = def.author ?? '';
    rec.body = Array.isArray(def.body) ? def.body : [String(def.body ?? '')];
    rec.position.set(x, y, z);

    const yaw = Math.atan2(-x, -z) + (rec.index % 5) * 0.21; // face the valley
    _e.set(0, yaw, 0);
    _q.setFromEuler(_e);
    _m.compose(_v.set(x, y, z), _q, new THREE.Vector3(1, 1, 1));
    rec.matrix = _m.clone();
    this.mesh.setMatrixAt(rec.index, rec.matrix);
    this.glow.setMatrixAt(rec.index, rec.matrix);
    this.mesh.count = Math.max(this.mesh.count, rec.index + 1);
    this.glow.count = Math.max(this.glow.count, rec.index + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.glow.instanceMatrix.needsUpdate = true;

    if (!rec.entry && !this.collected.has(rec.id)) rec.entry = this._register(rec);
    return rec;
  }

  _register(rec) {
    return this.interactables.register({
      position: rec.position,
      radius: 2.3,
      label: 'DATAPOINT',
      hold: 0.5,
      once: true,
      datapoint: rec,
      onInteract: () => this.collect(rec.id),
    });
  }

  /* ------------------------------------------------------------- collect */

  collect(id) {
    const rec = this.byId.get(id);
    if (!rec || this.collected.has(id)) return false;
    this.collected.add(id);
    // the pedestal stays; the slate goes dark so a read record reads as read
    this.glow.setMatrixAt(rec.index, ZERO_M);
    this.glow.instanceMatrix.needsUpdate = true;
    if (rec.entry) { this.interactables.unregister(rec.entry); rec.entry = null; }
    this.ctx.events?.emit?.('datapoint-collected', {
      id, title: rec.title, category: rec.category,
      have: this.collected.size, total: this.list.length,
    });
    return true;
  }

  /* ---------------------------------------------------------------- save */

  serialize() { return { collected: [...this.collected] }; }

  deserialize(data) {
    if (!data) return;
    for (const id of data.collected ?? []) {
      const rec = this.byId.get(id);
      if (!rec || this.collected.has(id)) continue;
      this.collected.add(id);
      this.glow.setMatrixAt(rec.index, ZERO_M);
      if (rec.entry) { this.interactables.unregister(rec.entry); rec.entry = null; }
    }
    this.glow.instanceMatrix.needsUpdate = true;
  }

  update(dt, t) {
    // one shared material write per frame — never per instance
    const k = 0.72 + 0.28 * Math.sin(t * 2.6);
    this._glowMat.color.copy(this._glowBase).multiplyScalar(k);
  }
}

/** Minimal geometry merge that does not need BufferGeometryUtils' index rules. */
function mergeSimple(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of parts) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    nrm.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.computeBoundingSphere();
  return out;
}
