import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * World gather nodes (docs/research/mechanics.md §5-6: "the rhythm is fight,
 * then wander picking glowing herbs to top the pouch back up"):
 *
 *  - ~120 medicinal herbs: clustered stem bundles with glow-tipped green-cyan
 *    bulbs (bloom-hot, toneMapped:false). Gather -> player.addPouch(25) +
 *    'item-gained' medicinal-herb. Respawn 120 s.
 *  - ~80 ridge-wood: fallen branch bundles biased toward the pine stands.
 *    Gather -> ridge-wood x2-4. Respawn 120 s.
 *  - 3 camp supply crates: one-shot loot (shards + blaze/sparker/chillwater
 *    ammo resources) through the loot-popup path.
 *
 * Everything is instanced: 4 draw calls total (herb stems, herb bulbs, wood,
 * crates). Terrain-conforming, deterministic RNG, exclusion zones: camp
 * clearing + steep rock. Zero per-frame allocations.
 */

const CAMP = { x: 22, z: 30 };
const CAMP_EXCLUDE = 9;      // spec: none in the camp clearing (min 7 m)
const RESPAWN_S = 120;

const HERB_TARGET = 120;
const WOOD_TARGET = 80;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Vertex-color a geometry with a base color + luminance jitter. */
function tint(geo, color, jitter, rng) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i++) {
    const k = 1 + (rng() * 2 - 1) * jitter;
    arr[i * 3] = _c.r * k;
    arr[i * 3 + 1] = _c.g * k;
    arr[i * 3 + 2] = _c.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Tapered cylinder from a to b (arrays). */
function tube(a, b, r0, r1, radial = 5) {
  const len = _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).length();
  const geo = new THREE.CylinderGeometry(r1, r0, len, radial);
  _q.setFromUnitVectors(UP, _v.normalize());
  _m.compose(
    _v2.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2),
    _q,
    new THREE.Vector3(1, 1, 1),
  );
  geo.applyMatrix4(_m);
  return geo;
}

export class Gather {
  constructor(ctx, interactables) {
    this.ctx = ctx;
    this.interactables = interactables;

    this.group = new THREE.Group();
    this.group.name = 'gather-nodes';
    ctx.scene.add(this.group);

    this.nodes = [];      // { kind, index, position, matrix, entry, hidden }
    this._respawns = [];  // { node, at } (uses real elapsed t)
    this._time = 0;

    this._buildHerbs();
    this._buildWood();
    this._buildCrates();
  }

  /* ------------------------------ placement ----------------------------- */

  _ok(x, z, maxH, maxSlope) {
    const t = this.ctx.terrain;
    if (Math.hypot(x - CAMP.x, z - CAMP.z) < CAMP_EXCLUDE) return false;
    if (Math.hypot(x, z) > 315) return false;
    const h = t.getHeight(x, z);
    if (h > maxH) return false;
    const gx = (t.getHeight(x + 0.8, z) - h) / 0.8;
    const gz = (t.getHeight(x, z + 0.8) - h) / 0.8;
    if (gx * gx + gz * gz > maxSlope * maxSlope) return false; // steep rock
    return true;
  }

  /* -------------------------------- herbs ------------------------------- */

  _herbGeometries() {
    // one herb variant: 6 arcing stems + glow bulb at each tip + basal leaves
    const rng = mulberry32(0x4EC9B0);
    const stems = [];
    const bulbGeos = [];
    const nStem = 6;
    for (let i = 0; i < nStem; i++) {
      const ang = (i / nStem) * Math.PI * 2 + rng() * 0.7;
      const lean = 0.10 + rng() * 0.16;
      const h = 0.26 + rng() * 0.18;
      const bx = Math.cos(ang) * 0.035, bz = Math.sin(ang) * 0.035;
      const tx = bx + Math.cos(ang) * lean, tz = bz + Math.sin(ang) * lean;
      stems.push(tint(tube([bx, 0, bz], [tx, h, tz], 0.012, 0.005, 4),
        '#3d5c33', 0.18, rng));
      const bulb = new THREE.IcosahedronGeometry(0.042 + rng() * 0.016, 0);
      bulb.translate(tx, h + 0.02, tz);
      bulbGeos.push(bulb);
    }
    // basal leaves: 3 low crossed blades
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2 + 0.4;
      const leaf = new THREE.PlaneGeometry(0.05, 0.16);
      leaf.translate(0, 0.08, 0);
      leaf.rotateX(-0.55);
      leaf.rotateY(ang);
      stems.push(tint(leaf, '#4a6b35', 0.2, rng));
    }
    return {
      stems: mergeGeometries(stems.map((g) => (g.index ? g.toNonIndexed() : g)), false),
      bulbs: mergeGeometries(bulbGeos.map((g) => (g.index ? g.toNonIndexed() : g)), false),
    };
  }

  _buildHerbs() {
    const { stems, bulbs } = this._herbGeometries();
    const stemMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
      emissive: '#1c2f14', emissiveIntensity: 0.5, // shaded side stays readable
    });
    // Bloom-hot green bulbs (#4dff88-family, per docs/research/ui.md): blue
    // kept low so the bloom halo stays leafy green instead of icy white.
    this._bulbBase = new THREE.Color(0.16, 2.4, 0.32);
    this._bulbMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this._bulbMat.color.copy(this._bulbBase);

    // clustered scatter: cluster centers, 2-4 herbs each ("berry refill loop")
    const rng = mulberry32(0xB07A11);
    const spots = [];
    for (let a = 0; a < 20000 && spots.length < HERB_TARGET; a++) {
      const r = 24 + Math.sqrt(rng()) * 276;
      const ang = rng() * Math.PI * 2;
      const cx = Math.cos(ang) * r, cz = Math.sin(ang) * r;
      if (!this._ok(cx, cz, 26, 0.30)) continue;
      const n = 2 + (rng() * 3) | 0;
      for (let i = 0; i < n && spots.length < HERB_TARGET; i++) {
        const x = cx + (rng() - 0.5) * 4.5;
        const z = cz + (rng() - 0.5) * 4.5;
        if (!this._ok(x, z, 26, 0.30)) continue;
        // keep nodes from stacking inside one interact radius
        let close = false;
        for (let j = spots.length - 1; j >= 0 && j > spots.length - 8; j--) {
          const dx = spots[j].x - x, dz = spots[j].z - z;
          if (dx * dx + dz * dz < 1.2) { close = true; break; }
        }
        if (close) continue;
        spots.push({ x, z, yaw: rng() * Math.PI * 2, s: 0.85 + rng() * 0.5 });
      }
    }

    this.herbStems = new THREE.InstancedMesh(stems, stemMat, spots.length);
    this.herbBulbs = new THREE.InstancedMesh(bulbs, this._bulbMat, spots.length);
    for (const mesh of [this.herbStems, this.herbBulbs]) {
      mesh.frustumCulled = false; // instances span the world
      mesh.castShadow = false;
      mesh.receiveShadow = true;
    }
    this.herbStems.name = 'herbs';
    this.herbBulbs.name = 'herb-glow';

    const terrain = this.ctx.terrain;
    for (let i = 0; i < spots.length; i++) {
      const sp = spots[i];
      const y = terrain.getHeight(sp.x, sp.z) - 0.02;
      _e.set(0, sp.yaw, 0);
      _q.setFromEuler(_e);
      const mat = new THREE.Matrix4().compose(
        _v.set(sp.x, y, sp.z), _q, _v2.set(sp.s, sp.s, sp.s),
      );
      this.herbStems.setMatrixAt(i, mat);
      this.herbBulbs.setMatrixAt(i, mat);
      this._addNode('herb', i, new THREE.Vector3(sp.x, y, sp.z), mat,
        [this.herbStems, this.herbBulbs]);
    }
    this.group.add(this.herbStems, this.herbBulbs);
    this.herbCount = spots.length;
  }

  /* ------------------------------ ridge-wood ---------------------------- */

  _woodGeometry() {
    const rng = mulberry32(0xA97C50);
    const parts = [];
    const woods = ['#5a4630', '#4a3826', '#66513a'];
    // 3 crossed fallen branches + 2 twigs
    for (let i = 0; i < 3; i++) {
      const ang = i * 1.9 + rng() * 0.6;
      const len = 0.55 + rng() * 0.35;
      const dx = Math.cos(ang) * len, dz = Math.sin(ang) * len;
      const y0 = 0.045 + i * 0.05;
      parts.push(tint(
        tube([-dx, y0, -dz], [dx, y0 + 0.04, dz], 0.055 - i * 0.008, 0.04 - i * 0.008, 5),
        woods[i % 3], 0.16, rng));
    }
    for (let i = 0; i < 2; i++) {
      const ang = rng() * Math.PI * 2;
      const len = 0.3 + rng() * 0.2;
      parts.push(tint(
        tube([Math.cos(ang) * 0.1, 0.03, Math.sin(ang) * 0.1],
          [Math.cos(ang) * len, 0.1 + rng() * 0.12, Math.sin(ang) * len],
          0.02, 0.012, 4),
        '#6a5138', 0.2, rng));
    }
    return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  }

  _buildWood() {
    const geo = this._woodGeometry();
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.95, metalness: 0,
    });
    const rng = mulberry32(0x51D6E);
    // same forest field vegetation.js clusters pines with -> wood reads as
    // deadfall near the tree stands, with some strays in the open
    const { SimplexNoise } = this._noiseCtor();
    const forest = new SimplexNoise(777);

    const spots = [];
    for (let a = 0; a < 24000 && spots.length < WOOD_TARGET; a++) {
      const r = 26 + Math.sqrt(rng()) * 286;
      const ang = rng() * Math.PI * 2;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      if (!this._ok(x, z, 30, 0.38)) continue;
      const nearTrees = forest.fbm(x * 0.006, z * 0.006, 3) > 0.03;
      if (!nearTrees && rng() > 0.22) continue;
      let close = false;
      for (let j = 0; j < spots.length; j++) {
        const dx = spots[j].x - x, dz = spots[j].z - z;
        if (dx * dx + dz * dz < 36) { close = true; break; }
      }
      if (close) continue;
      spots.push({ x, z, yaw: rng() * Math.PI * 2, s: 0.9 + rng() * 0.55 });
    }

    this.woodMesh = new THREE.InstancedMesh(geo, mat, spots.length);
    this.woodMesh.name = 'ridge-wood';
    this.woodMesh.frustumCulled = false;
    // wood casts shadow so the bundles sit grounded instead of hovering
    // (herbs stay castShadow=false — their contact reads fine and it saves a
    // shadow-pass draw)
    this.woodMesh.castShadow = true;
    this.woodMesh.receiveShadow = true;

    const terrain = this.ctx.terrain;
    for (let i = 0; i < spots.length; i++) {
      const sp = spots[i];
      const y = terrain.getHeight(sp.x, sp.z);
      terrain.getNormal(sp.x, sp.z, _v2);
      _q.setFromUnitVectors(UP, _v2);            // hug the slope
      _e.set(0, sp.yaw, 0);
      const qy = new THREE.Quaternion().setFromEuler(_e);
      _q.multiply(qy);
      const mat4 = new THREE.Matrix4().compose(
        _v.set(sp.x, y - 0.01, sp.z), _q, new THREE.Vector3(sp.s, sp.s, sp.s),
      );
      this.woodMesh.setMatrixAt(i, mat4);
      this._addNode('wood', i, new THREE.Vector3(sp.x, y, sp.z), mat4, [this.woodMesh]);
    }
    this.group.add(this.woodMesh);
    this.woodCount = spots.length;
  }

  /** vegetation.js keeps SimplexNoise in terrain.js — import lazily to avoid
   *  a hard link if terrain's export shape shifts under the terrain builder. */
  _noiseCtor() {
    // static import would be cleaner but terrain.js is being rewritten this
    // round; its SimplexNoise export is contract-frozen, so this stays safe.
    return { SimplexNoise: this.ctx.terrain?.noise?.constructor ?? FallbackNoise };
  }

  /* -------------------------------- crates ------------------------------ */

  _crateGeometry() {
    const rng = mulberry32(0xC4A7E5);
    const parts = [];
    // plank body: three horizontal bands with recessed gaps
    const body = new THREE.BoxGeometry(0.9, 0.62, 0.72, 1, 6, 1);
    const pos = body.attributes.position;
    const n = pos.count;
    const arr = new Float32Array(n * 3);
    _c.set('#5f4526');
    const bandK = [0.72, 1.0, 0.84];
    for (let i = 0; i < n; i++) {
      const t = (pos.getY(i) / 0.62 + 0.5) * 3;
      const band = Math.min(2, Math.max(0, Math.round(t - 0.5)));
      let k = bandK[band] * (0.95 + rng() * 0.1);
      if (Math.abs(t - 1) < 0.06 || Math.abs(t - 2) < 0.06) k *= 0.45;
      arr[i * 3] = _c.r * k * 1.04;
      arr[i * 3 + 1] = _c.g * k;
      arr[i * 3 + 2] = _c.b * k * 0.9;
    }
    body.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    body.translate(0, 0.31, 0);
    parts.push(body);
    // corner posts + lid plank
    for (const [px, pz] of [[-0.45, -0.36], [0.45, -0.36], [-0.45, 0.36], [0.45, 0.36]]) {
      const post = new THREE.BoxGeometry(0.09, 0.66, 0.09);
      post.translate(px, 0.33, pz);
      parts.push(tint(post, '#4c3a26', 0.1, rng));
    }
    const lid = new THREE.BoxGeometry(0.98, 0.05, 0.3);
    lid.translate(0, 0.655, -0.12);
    parts.push(tint(lid, '#6a5138', 0.12, rng));
    const lid2 = new THREE.BoxGeometry(0.98, 0.05, 0.3);
    lid2.translate(0, 0.645, 0.2);
    parts.push(tint(lid2, '#57452b', 0.12, rng));
    return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  }

  _buildCrates() {
    const geo = this._crateGeometry();
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.9, metalness: 0,
    });
    // camp edge spots clear of tents / rack / firepit props (see camp.js)
    const crates = [
      {
        x: 28.8, z: 27.6, yaw: 0.5,
        loot: [{ id: 'metal-shards', n: 25 }, { id: 'blaze', n: 4 }],
      },
      {
        x: 15.9, z: 31.2, yaw: -0.7,
        loot: [{ id: 'metal-shards', n: 20 }, { id: 'sparker', n: 4 }, { id: 'wire', n: 3 }],
      },
      {
        x: 23.2, z: 36.0, yaw: 1.9,
        loot: [{ id: 'metal-shards', n: 20 }, { id: 'chillwater', n: 4 }, { id: 'echo-shell', n: 2 }],
      },
    ];
    this.crateMesh = new THREE.InstancedMesh(geo, mat, crates.length);
    this.crateMesh.name = 'supply-crates';
    this.crateMesh.frustumCulled = false;
    this.crateMesh.castShadow = true;
    this.crateMesh.receiveShadow = true;

    const terrain = this.ctx.terrain;
    for (let i = 0; i < crates.length; i++) {
      const c = crates[i];
      const y = terrain.getHeight(c.x, c.z) - 0.02;
      _e.set(0, c.yaw, 0);
      _q.setFromEuler(_e);
      const m4 = new THREE.Matrix4().compose(
        _v.set(c.x, y, c.z), _q, _v2.set(1, 1, 1),
      );
      this.crateMesh.setMatrixAt(i, m4);
      this.crateMesh.setColorAt(i, _c.set(0xffffff));
      const position = new THREE.Vector3(c.x, y, c.z);
      const node = { kind: 'crate', index: i, position, matrix: m4, hidden: false };
      node.entry = this.interactables.register({
        position, radius: 2.4, label: 'LOOT', once: true,
        loot: c.loot,
        gatherNode: node,
        // crates never respawn; the emptied crate stays, dimmed (HZD shows
        // an emptied indicator on looted containers)
        onInteract: () => {
          this.crateMesh.setColorAt(i, _c.set(0x4d4640));
          if (this.crateMesh.instanceColor) this.crateMesh.instanceColor.needsUpdate = true;
        },
      });
      this.nodes.push(node);
    }
    this.group.add(this.crateMesh);
  }

  /* --------------------------- node bookkeeping ------------------------- */

  _addNode(kind, index, position, matrix, meshes) {
    const node = { kind, index, position, matrix, meshes, hidden: false };
    node.entry = this._makeEntry(node);
    this.nodes.push(node);
    return node;
  }

  _makeEntry(node) {
    const entry = {
      position: node.position,
      radius: 2.2,
      label: 'GATHER',
      once: true, // interactables drops it; we re-register on respawn
      gatherNode: node,
      onInteract: () => this._onGather(node),
    };
    return this.interactables.register(entry);
  }

  _onGather(node) {
    const ctx = this.ctx;
    if (node.kind === 'herb') {
      // herbs fill the medicine pouch, not the satchel (mechanics.md §6)
      ctx.player?.addPouch?.(25);
      ctx.events.emit('item-gained', {
        id: 'medicinal-herb', count: 1,
        total: Math.round(ctx.player?.pouch ?? 0),
        name: 'Medicinal Herb', glyph: '❧', color: '#7fb069',
      });
    } else if (node.kind === 'wood') {
      const n = 2 + ((node.index * 7919) % 3); // deterministic 2..4
      ctx.inventory?.add?.('ridge-wood', n);
    }
    this._hideNode(node, node.kind !== 'crate');
  }

  _hideNode(node, respawns) {
    if (node.hidden) return;
    node.hidden = true;
    if (node.meshes) {
      for (const mesh of node.meshes) {
        mesh.setMatrixAt(node.index, ZERO_M);
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    if (respawns) this._respawns.push({ node, at: this._time + RESPAWN_S });
  }

  _restoreNode(node) {
    node.hidden = false;
    if (node.meshes) {
      for (const mesh of node.meshes) {
        mesh.setMatrixAt(node.index, node.matrix);
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    node.entry = this._makeEntry(node); // fresh registration
  }

  /** Testing hook: make every pending respawn due right now. */
  forceRespawn() {
    for (const r of this._respawns) r.at = 0;
  }

  update(dt, t) {
    this._time = t; // real elapsed time — respawns ignore slow-mo

    // herb glow pulse (single material write)
    if (this._bulbMat) {
      const k = 0.82 + 0.22 * Math.sin(t * 2.3);
      this._bulbMat.color.copy(this._bulbBase).multiplyScalar(k);
    }

    // respawns (rare; swap-pop to avoid splicing churn)
    const rs = this._respawns;
    for (let i = rs.length - 1; i >= 0; i--) {
      if (rs[i].at <= t) {
        this._restoreNode(rs[i].node);
        rs[i] = rs[rs.length - 1];
        rs.pop();
      }
    }
  }
}

/** Minimal fallback noise (only used if terrain's export shape ever changes). */
class FallbackNoise {
  constructor() {}
  fbm() { return 0.1; }
}
