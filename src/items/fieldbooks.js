import * as THREE from 'three';

/**
 * FIELD BOOKS + NOTEBOOK (M0.3 stand-in for bible §8.5: 24 Field Books, lore only).
 * ===========================================================================
 * The 24 records are stubs: titles and categories only, no text and no place on
 * the island yet (the writing area authors them; placement arrives with the
 * sites). A record is registered as a pickup only when it carries x and z:
 *
 *     ctx.items.fieldbooks.place({ id, title, category, body, x, z, y? })
 *
 * Anything registered that way joins the Notebook and the Focus reveal pass
 * exactly like the twelve shipped here. Ids are idempotent — re-placing an id
 * moves the existing record instead of duplicating it.
 *
 * PUBLISHED (`ctx.items.fieldbooks`)
 *   list            -> [record]           every placed record
 *   collected       -> Set<id>
 *   count / total   -> numbers for the HUD / Notebook header
 *   categories()    -> [{ id, label, have, total }]
 *   record(id)      -> record | null
 *   collect(id)     -> bool               (emits 'fieldbook-collected')
 *   place(def)      -> record             (world-props / progression hook)
 *   serialize() / deserialize(d)          (progression's save calls these if
 *                                          it wants them; nothing breaks if
 *                                          it never does)
 *
 * EVENTS
 *   'fieldbook-collected' { id, title, category, have, total }
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
  survey: 'SURVEY NOTES',
  sketch: 'SKETCHES',
  letter: 'THE CONVERSATION',
};

/** The 24 Field Books (stubs: no text, no position yet). */
export const FIELD_BOOKS = [
  { id: 'fb-01', category: 'survey', title: 'Field Book 1', body: [] },
  { id: 'fb-02', category: 'sketch', title: 'Field Book 2', body: [] },
  { id: 'fb-03', category: 'letter', title: 'Field Book 3', body: [] },
  { id: 'fb-04', category: 'survey', title: 'Field Book 4', body: [] },
  { id: 'fb-05', category: 'sketch', title: 'Field Book 5', body: [] },
  { id: 'fb-06', category: 'letter', title: 'Field Book 6', body: [] },
  { id: 'fb-07', category: 'survey', title: 'Field Book 7', body: [] },
  { id: 'fb-08', category: 'sketch', title: 'Field Book 8', body: [] },
  { id: 'fb-09', category: 'letter', title: 'Field Book 9', body: [] },
  { id: 'fb-10', category: 'survey', title: 'Field Book 10', body: [] },
  { id: 'fb-11', category: 'sketch', title: 'Field Book 11', body: [] },
  { id: 'fb-12', category: 'letter', title: 'Field Book 12', body: [] },
  { id: 'fb-13', category: 'survey', title: 'Field Book 13', body: [] },
  { id: 'fb-14', category: 'sketch', title: 'Field Book 14', body: [] },
  { id: 'fb-15', category: 'letter', title: 'Field Book 15', body: [] },
  { id: 'fb-16', category: 'survey', title: 'Field Book 16', body: [] },
  { id: 'fb-17', category: 'sketch', title: 'Field Book 17', body: [] },
  { id: 'fb-18', category: 'letter', title: 'Field Book 18', body: [] },
  { id: 'fb-19', category: 'survey', title: 'Field Book 19', body: [] },
  { id: 'fb-20', category: 'sketch', title: 'Field Book 20', body: [] },
  { id: 'fb-21', category: 'letter', title: 'Field Book 21', body: [] },
  { id: 'fb-22', category: 'survey', title: 'Field Book 22', body: [] },
  { id: 'fb-23', category: 'sketch', title: 'Field Book 23', body: [] },
  { id: 'fb-24', category: 'letter', title: 'Field Book 24', body: [] },
];

export class FieldBooks {
  constructor(ctx, interactables) {
    this.ctx = ctx;
    this.interactables = interactables;

    this.list = [];
    this.byId = new Map();
    this.collected = new Set();

    this.group = new THREE.Group();
    this.group.name = 'fieldbooks';
    ctx.scene.add(this.group);

    this._buildMeshes(FIELD_BOOKS.length + 8); // headroom for world-props
    // only records with a place on the island become pickups; the stubs have none yet
    for (const def of FIELD_BOOKS) if (Number.isFinite(def.x) && Number.isFinite(def.z)) this.place(def);
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
    this.mesh.name = 'fieldbook-pedestals';
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
    this.glow.name = 'fieldbook-slates';
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
      label: 'FIELD BOOK',
      hold: 0.5,
      once: true,
      fieldbook: rec,
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
    this.ctx.events?.emit?.('fieldbook-collected', {
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
