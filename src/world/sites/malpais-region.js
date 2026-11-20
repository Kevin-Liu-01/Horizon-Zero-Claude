import * as THREE from 'three';
import { ROCK_VERT_PARS, ROCK_VERT_WORLD, GROUND_FRAG_PARS, GROUND_ROUGH, GROUND_NORMAL } from '../island/groundShader.js';
import { patchAerial, patchDeck } from '../island/aerial.js';
import { biomesAt, fbm } from '../island/recipe.js';
import { MalpaisBlockout } from './malpais.js';
import { MALPAIS_PARS, MALPAIS_ROCK_COLOR } from './malpais-shader.js';
import { MALPAIS_LAYERS } from './malpais-files.js';
import { CLINKER, clinkerPlan, pinnaclePlan, ridgePlan, clastGeometry, pinnacleGeometry, ridgeGeometry, hornitoGeometry, tubeGeometry, pinnacleColliders, ridgeColliders, coneWeight } from './malpais-rocks.js';
import { STEAM, TUBE_SHELTER } from './malpais-layout.js';
import { buildBrazier } from '../settlements/brazier.js';
import { buildSteam } from './malpais-steam.js';
import { kilnYardsNearJobs, finishKilnYardsNear } from './kilnyards-near.js';

/**
 * THE MALPAIS, BUILT ON APPROACH (Milestone 3 wave 2, area A; M3 briefs MP10, MP11, rule 15; EF1 `A-region-hitch`).
 * Nothing of the Malpais' near form exists at boot: the first load carries 0 Malpais bytes and the boot compiles none of
 * its programs. The island's ground there is drawn by the plain ground program with the blockout's tone (the far
 * reading; src/world/island/bake.js malpaisTone), and the Yards by their far form (src/world/island/kilnyards.js).
 * When the regions seam fires `region-approach` for 'malpais' (60 m on foot, 150 m in the air; src/core/regions.js) the
 * region is built in this order, each step inside a per-frame budget so no frame pays for more than a slice:
 *
 *   1. FETCH     the ground's two KTX2 arrays (./malpais-files.js MALPAIS_LAYERS), started first; the transcode runs in
 *                the KTX2 loader's worker
 *   2. BUILD     the zone map (R the biome weight, G the sheet field, B the cinder bands' offset, A Rust Cone; 2.5 m a
 *                texel), which terrain chunks hold Malpais ground, the clinker's placements, the pinnacles, the hornitos'
 *                spatter, the tube shelter's blockout (./malpais.js), the Yards' near form (./kilnyards-near.js)
 *   3. REGISTER  every material with the environment (fog and the cascades change the program: registered first, so the
 *                program compiled is the one drawn)
 *   4. COMPILE   engine.compileOffFrame on a group never added to the scene: the links are issued and awaited on later
 *                frames, then given their first use (the seam's order: register, compile, wait, then add)
 *   5. UPLOAD    each texture to the GPU, one a frame
 *   6. ADD       the group to the scene, the Malpais' ground program onto the chunks that hold Malpais ground
 *                (terrain.setMalpaisGround), the far form of the Yards hidden, the colliders and the Yards' walk grid
 *                registered
 * `region-depart` takes it all down again (the textures leave the GPU: EF2's residency per place); a depart in the middle
 * of a build cancels it at its next step.
 *
 *   const M = new MalpaisRegion(ctx, terrain, { groundAO })
 *   M.ensure() -> Promise<boolean>     build now (a staging or a gate may ask without the seam); resolves when added
 *   M.release()                       take it down
 *   M.state                           'cold' | 'building' | 'ready' | 'failed'
 *   M.stats                           { builds, ms: { step: ms }, totalMs, worstSliceMs, clasts, pinnacles, tris, draws, colliders, textures }
 *   M.perfSwitches()                  [{ id: 'malpais-ground' | 'malpais-rock' | 'malpais-steam' | 'malpais-kit', on, off }] (paired readback, MP4/MP10)
 *                                     and 'malpais-steam:<source id>' (wave 3: one plume alone against no steam)
 *   M.update()                        each frame (terrain.update): the clinker tiles past CLINKER.far hidden
 */
export const ZONE_MAP = Object.freeze({ x0: 40, z0: -376, x1: 512, z1: 448, cell: 2.5 });
/** The term's far fade (m): the textured ground gives way to the blockout tone the far field is baked from. */
/** (fix round 1: [200, 250], was [170, 240]) the far field takes over at terrain.js FAR_START (250 m), so the term ends there;
 * past it the blockout tone (bake.js malpaisTone) is the cold basalt's too */
export const MALPAIS_FADE = Object.freeze([200, 250]);
/** The per-frame budget of a build slice (ms). */
export const SLICE_MS = 5;

const now = () => performance.now();
/** The next frame (or 50 ms when no frame comes: a hidden page, a stopped loop). */
const nextFrame = () => new Promise((res) => {
  let done = false;
  const go = () => { if (!done) { done = true; res(); } };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(go);
  setTimeout(go, 50);
});

export class MalpaisRegion {
  constructor(ctx, terrain, { groundAO = '#include <aomap_fragment>' } = {}) {
    this.ctx = ctx;
    this.terrain = terrain;
    this._groundAO = groundAO;
    this.state = 'cold';
    this._gen = 0;
    this._promise = null;
    this._held = null;
    this.stats = { builds: 0, releases: 0, ms: {}, totalMs: 0, worstSliceMs: 0, clasts: 0, pinnacles: 0, tris: 0, draws: 0, colliders: 0, textures: 0, error: null };
    this._switch = { ground: true, rock: true, kit: true, steam: true };
    const ev = ctx.events;
    this._listeners = [];
    if (ev?.on) {
      const a = (e) => { if (e?.region === 'malpais') this.ensure(); };
      const d = (e) => { if (e?.region === 'malpais') this.release(); };
      ev.on('region-approach', a); ev.on('region-depart', d);
      this._listeners.push(['region-approach', a], ['region-depart', d]);
    }
  }

  get ready() { return this.state === 'ready'; }

  /** Build now if it is not built or building; resolves true once it is in the scene (false if cancelled or failed). */
  ensure() {
    if (this.state === 'cold' || this.state === 'failed') {
      const gen = ++this._gen;
      this.state = 'building';
      this._promise = this._build(gen).catch((err) => {
        if (gen === this._gen) { this.state = 'failed'; this.stats.error = String(err?.message || err).slice(0, 300); }
        console.warn('[CAL] the Malpais did not build:', err?.message || err);
        return false;
      });
    }
    return this._promise || Promise.resolve(this.state === 'ready');
  }

  /* ------------------------------------------------------------------ the build */
  async _build(gen) {
    const C = this.ctx, T = this.terrain, t0 = now();
    const held = { gen, textures: [], geos: [], mats: [], colliderIds: [], tiles: [] };
    const live = () => gen === this._gen;
    const step = (k, ms) => { this.stats.ms[k] = Math.round((this.stats.ms[k] || 0) + ms); };
    let sliceT = now();
    const slice = async () => {
      const dt = now() - sliceT;
      if (dt > this.stats.worstSliceMs) this.stats.worstSliceMs = Math.round(dt * 10) / 10;
      await nextFrame();
      sliceT = now();
      if (!live()) throw new CancelBuild();
    };
    const over = () => now() - sliceT > SLICE_MS;
    try {
      // 1. FETCH (both arrays at once; the transcode is the loader's worker's)
      const tf = now();
      const ktx = C.assets?.ktx2?.load;
      const texP = ktx ? Promise.all(['a', 'n'].map((k) => ktx(`/${MALPAIS_LAYERS.files[k]}`, { colorSpace: 'none', wrap: 'repeat', anisotropy: 4 }))) : Promise.resolve([null, null]);
      texP.catch(() => {});

      // 2. BUILD: the zone map
      let tb = now();
      const Z = ZONE_MAP, nx = Math.ceil((Z.x1 - Z.x0) / Z.cell), nz = Math.ceil((Z.z1 - Z.z0) / Z.cell);
      const zone = new Uint8Array(nx * nz * 4), w = new Float64Array(6);
      for (let j = 0; j < nz; j++) {
        const z = Z.z0 + (j + 0.5) * Z.cell;
        for (let i = 0; i < nx; i++) {
          const x = Z.x0 + (i + 0.5) * Z.cell, o = (j * nx + i) * 4;
          biomesAt(x, z, w);
          zone[o] = Math.round(Math.min(1, Math.max(0, w[2])) * 255);
          if (w[2] > 0.002) {
            zone[o + 1] = Math.round(Math.min(1, Math.max(0, fbm(x * 0.012 + 3.1, z * 0.012 - 8.3, 3))) * 255);
            zone[o + 2] = Math.round(Math.min(1, Math.max(0, fbm(x * 0.03, z * 0.03 + 4, 2))) * 255);
            zone[o + 3] = Math.round(coneWeight(x, z) * 255);
          }
        }
        if (over()) { step('zones', now() - tb); await slice(); tb = now(); }
      }
      step('zones', now() - tb);
      const zoneTex = new THREE.DataTexture(zone, nx, nz, THREE.RGBAFormat, THREE.UnsignedByteType);
      zoneTex.minFilter = THREE.LinearFilter; zoneTex.magFilter = THREE.LinearFilter; zoneTex.generateMipmaps = false;
      zoneTex.wrapS = zoneTex.wrapT = THREE.ClampToEdgeWrapping; zoneTex.colorSpace = THREE.NoColorSpace; zoneTex.flipY = false;
      zoneTex.name = 'malpais-zones'; zoneTex.needsUpdate = true;
      held.textures.push(zoneTex);

      // which terrain chunks hold Malpais ground (biome weight over 0.002 at any node on a 4-node stride)
      tb = now();
      const chunks = T._chunks || [], hg = T._hg, mchunks = [];
      for (const Ck of chunks) {
        const b = Ck.box;
        if (!b || b.max.x < Z.x0 || b.min.x > Z.x1 || b.max.z < Z.z0 || b.min.z > Z.z1) continue;
        let hit = false;
        for (let iz = Ck.z0; iz <= Ck.z1 && !hit; iz += 4) for (let ix = Ck.x0; ix <= Ck.x1; ix += 4) {
          biomesAt(ix * hg.step - hg.half, iz * hg.step - hg.half, w);
          if (w[2] > 0.002) { hit = true; break; }
        }
        if (hit) mchunks.push(Ck);
        if (over()) { step('chunks', now() - tb); await slice(); tb = now(); }
      }
      step('chunks', now() - tb);

      // the clinker's placements (resumable), then its tiles
      const ground = (x, z) => T.getHeight(x, z);
      tb = now();
      let plan = null;
      do { plan = clinkerPlan(ground, plan, SLICE_MS - 0.5); if (!plan.done) { step('clinker', now() - tb); await slice(); tb = now(); } } while (!plan.done);
      step('clinker', now() - tb);
      this.stats.clasts = plan.n;

      // the materials (rock: aa clinker and spires, the hornitos' spatter as dark scree, the tube's pahoehoe crust)
      const U = T.groundUniforms;
      const malU = {
        tMalA: { value: null }, tMalN: { value: null }, tMalZ: { value: zoneTex },
        uMalBox: { value: new THREE.Vector4(Z.x0, Z.z0, 1 / (nx * Z.cell), 1 / (nz * Z.cell)) },
        uMalTile: { value: new THREE.Vector4(...MALPAIS_LAYERS.ids.map((id) => 1 / MALPAIS_LAYERS.tile[id])) },
        uMalK: { value: new THREE.Vector4(1, MALPAIS_FADE[0], MALPAIS_FADE[1], 0) },
      };
      this._malU = malU;
      const rockMat = (key, layer, scale, gain, tint) => {
        const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
        const uR = { value: new THREE.Vector4(layer, scale, gain, tint) };
        m.onBeforeCompile = (shader) => {
          Object.assign(shader.uniforms, U, malU);
          shader.uniforms.uMalRock = uR;
          shader.vertexShader = shader.vertexShader.replace('#include <common>', ROCK_VERT_PARS).replace('#include <worldpos_vertex>', ROCK_VERT_WORLD);
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `${GROUND_FRAG_PARS}\n${MALPAIS_PARS}\nuniform vec4 uMalRock;`)
            .replace('#include <color_fragment>', MALPAIS_ROCK_COLOR)
            .replace('#include <roughnessmap_fragment>', GROUND_ROUGH)
            .replace('#include <normal_fragment_begin>', GROUND_NORMAL)
            .replace('#include <aomap_fragment>', this._groundAO);
          patchAerial(shader); patchDeck(shader);
        };
        m.customProgramCacheKey = () => `cal-malpais-rock-${key}`;
        m.name = `malpais-rock-${key}`;
        held.mats.push(m);
        return m;
      };
      const matClinker = rockMat('aa', 0, 1.6, 1.0, 0);
      // (e664972: the scree layer on the hornitos read as red foliage) spatter is the aa's dark clinker, a little warmer
      const matSpatter = rockMat('spatter', 0, 0.9, 1.1, 0.0);
      // (wave 2b, R9) the tube shelter's crust and vault: the pahoehoe layer at its own 3.4 m tile (the rock reads layer 1
      // at the cinder's tile x scale), a little darker than the sheets
      const matTube = rockMat('tube', 1, MALPAIS_LAYERS.tile.cinder / MALPAIS_LAYERS.tile.pahoehoe, 0.85, 0.0);
      matTube.side = THREE.DoubleSide;

      const group = new THREE.Group();
      group.name = 'malpais';
      // clinker: one InstancedMesh per tile
      tb = now();
      const clast = clastGeometry();
      held.geos.push(clast);
      const L = plan.list, byTile = new Map(), TS = CLINKER.tile;
      for (let i = 0; i < L.length; i += 6) {
        const k = `${Math.floor(L[i] / TS)},${Math.floor(L[i + 2] / TS)}`;
        let a = byTile.get(k); if (!a) byTile.set(k, (a = [])); a.push(i);
      }
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3();
      let tris = 0;
      for (const [k, idx] of byTile) {
        const mesh = new THREE.InstancedMesh(clast, matClinker, idx.length);
        let cx = 0, cz = 0;
        for (const i of idx) { cx += L[i]; cz += L[i + 2]; }
        cx /= idx.length; cz /= idx.length;
        mesh.position.set(cx, 0, cz);
        idx.forEach((i, n) => {
          const s = L[i + 3];
          e3.set((((i * 7) % 11) / 11 - 0.5) * 0.5, L[i + 5], (((i * 13) % 17) / 17 - 0.5) * 0.5);
          m4.compose(p3.set(L[i] - cx, L[i + 1], L[i + 2] - cz), q.setFromEuler(e3), s3.set(s * (0.8 + 0.4 * ((i % 5) / 5)), s * L[i + 4], s));
          mesh.setMatrixAt(n, m4);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.name = `malpais-clinker-${k}`;
        mesh.castShadow = false; mesh.receiveShadow = true;
        group.add(mesh);
        held.tiles.push({ mesh, x: cx, z: cz, r: (mesh.boundingSphere?.radius ?? TS) });
        tris += idx.length * clast.attributes.position.count / 3;
        if (over()) { step('rock', now() - tb); await slice(); tb = now(); }
      }
      // pinnacles and the hornitos' spatter
      const pins = pinnaclePlan(ground);
      this.stats.pinnacles = pins.length;
      const pg = pinnacleGeometry(pins), hgeo = hornitoGeometry(ground);
      held.geos.push(pg, hgeo);
      const pm = new THREE.Mesh(pg, matClinker); pm.name = 'malpais-pinnacles'; pm.castShadow = true; pm.receiveShadow = true;
      const hm = new THREE.Mesh(hgeo, matSpatter); hm.name = 'malpais-hornitos'; hm.castShadow = true; hm.receiveShadow = true;
      group.add(pm, hm);
      tris += pg.attributes.position.count / 3 + hgeo.attributes.position.count / 3;
      step('rock', now() - tb);
      await slice();
      // (fix round 1) the pressure ridges and tumuli: the flow's large relief, drawn in the clinker's material
      tb = now();
      const ridges = ridgePlan(ground, pins);
      this.stats.ridges = ridges.length;
      const rgeo = ridgeGeometry(ridges, ground);
      held.geos.push(rgeo);
      const rm = new THREE.Mesh(rgeo, matClinker); rm.name = 'malpais-ridges'; rm.castShadow = true; rm.receiveShadow = true;
      group.add(rm);
      tris += rgeo.attributes.position.count / 3;
      step('rock', now() - tb);
      await slice();
      // (wave 2b, R9) the tube shelter at the hornito field: its crust and vault
      tb = now();
      const tgeo = tubeGeometry(ground);
      held.geos.push(tgeo);
      const tm = new THREE.Mesh(tgeo, matTube); tm.name = 'malpais-tube'; tm.castShadow = true; tm.receiveShadow = true;
      group.add(tm);
      tris += tgeo.index ? tgeo.index.count / 3 : tgeo.attributes.position.count / 3;
      // (M3 wave 3, MP6) the shelter's Brazier, unlit: the settlements' own Brazier (src/world/settlements/brazier.js, read
      // only), the bowl on its three stones with its seat stone, no cistern; ash in the bowl, no flame, no pool, no light
      // (the kindling is the Brazier rules' to wire: a spot that kindles). Two draws
      const br = buildBrazier({ terrain: T, x: TUBE_SHELTER.brazier.x, z: TUBE_SHELTER.brazier.z, yaw: 0, cistern: false, seed: 23 });
      br.setState({ kindled: false, burning: false });
      br.update(0, null, 1);
      br.group.name = 'malpais-tube-brazier';
      br.group.traverse((o) => { if (o.isMesh && o.material) { held.mats.push(o.material); if (o.name === 'brazier-cistern-water') o.visible = false; } });
      held.brazier = br;
      group.add(br.group);
      // (wave 2b, MP4) the steam: every plume of a group in one instanced draw
      const steam = buildSteam(STEAM, ground);
      held.steam = steam;
      for (const m of steam.materials) held.mats.push(m);
      group.add(steam.group);
      tris += steam.counts.triangles;
      this.stats.steam = steam.counts;
      step('rock', now() - tb);
      await slice();
      // the tube shelter's markers and the Yards' and the Malpais' blockers
      tb = now();
      const block = new MalpaisBlockout(C, group, ground, { hornitos: false });
      held.block = block;
      tris += block.stats.tris;
      step('blockout', now() - tb);
      await slice();
      // the Yards' near form, job by job
      tb = now();
      const results = [];
      for (const job of kilnYardsNearJobs({ ground })) { results.push(job()); if (over()) { step('yards', now() - tb); await slice(); tb = now(); } }
      const ky = finishKilnYardsNear(results);
      held.kit = ky;
      group.add(ky.group);
      tris += ky.counts.triangles;
      step('yards', now() - tb);
      await slice();

      // the ground's programs: the plain ground's and the Holds' with the Malpais term (the Holds' pattern)
      const groundMat = (holds) => {
        const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
        m.defines = holds ? { CAL_G_HOLDS: 1, CAL_G_MALPAIS: 1 } : { CAL_G_MALPAIS: 1 };
        m.onBeforeCompile = (shader) => { T._groundCompile(shader, null); Object.assign(shader.uniforms, malU); };
        m.customProgramCacheKey = () => (holds ? 'cal-ground-terrain-holds-malpais' : 'cal-ground-terrain-malpais');
        m.name = holds ? 'ground-holds-malpais' : 'ground-malpais';
        held.mats.push(m);
        return m;
      };
      const gPlain = groundMat(false), gHolds = groundMat(true);
      held.ground = { plain: gPlain, holds: gHolds, pair: [gPlain, gHolds], chunks: new Set(mchunks) };

      // the textures land (started in step 1)
      tb = now();
      const [tA, tN] = await texP;
      if (!live()) throw new CancelBuild();
      if (!tA || !tN) throw new Error('the Malpais layers did not load');
      held.textures.push(tA, tN);
      malU.tMalA.value = tA; malU.tMalN.value = tN;
      step('fetch', now() - tf);
      this.stats.textures = held.textures.length;
      await slice();

      // 3-4. REGISTER, then COMPILE off the frame (a group never added to the scene: a Malpais chunk under each ground
      // program, the rock, the kit), awaited, then each program's first use
      tb = now();
      const env = C.environment, E = C.engine;
      for (const m of held.mats) env?.registerMaterial?.(m);
      for (const m of ky.materials) env?.registerMaterial?.(m);
      if (block.material) env?.registerMaterial?.(block.material);
      // one material at a time, a frame apart (three builds each program's source on the main thread: the ground's is
      // the island's largest, so two in one frame would pass a slice), each awaited before the next is issued
      const chunk = mchunks.find((Ck) => Ck.mesh?.geometry);
      const byMat = new Map();
      if (chunk) { byMat.set(gPlain, [new THREE.Mesh(chunk.mesh.geometry, gPlain)]); byMat.set(gHolds, [new THREE.Mesh(chunk.mesh.geometry, gHolds)]); }
      const moved = [];
      group.traverse((o) => { if (o.isMesh) moved.push(o); });
      for (const o of moved) { const m = o.material; if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(o); }
      step('register', now() - tb);
      const compile = { ms: 0, programs: 0, materials: byMat.size };
      for (const [, list] of byMat) {
        if (!E?.compileOffFrame) break;
        const warm = new THREE.Group(), parents = list.map((o) => o.parent);
        for (const o of list) warm.add(o);
        const r = await E.compileOffFrame(warm, { timeoutMs: 8000 });
        list.forEach((o, i) => { if (parents[i] && parents[i] !== warm) parents[i].add(o); else warm.remove(o); });
        compile.ms += r.ms; compile.programs += r.programs;
        sliceT = now();
        if (!live()) throw new CancelBuild();
        await slice();
      }
      this.stats.compile = compile;

      // 5. UPLOAD, one texture a frame
      tb = now();
      for (const t of held.textures) { try { E?.renderer?.initTexture?.(t); } catch { /* the first draw uploads it */ } step('upload', now() - tb); await slice(); tb = now(); }

      // 6. ADD
      tb = now();
      C.scene.add(group);
      held.group = group;
      if (T.kilnYards?.group) T.kilnYards.group.visible = false;
      if (this._switch.ground) T.setMalpaisGround?.(held.ground);
      block.update();
      const Col = C.collision;
      if (Col?.register) for (const d of [...pinnacleColliders(pins), ...ridgeColliders(ridges, ground)]) {
        const id = Col.register({ kind: d.kind, shape: d.shape, blocking: true, camera: true, occluder: true, ref: d.id.startsWith('ridge') ? rm : pm });
        if (Array.isArray(id)) held.colliderIds.push(...id); else if (id >= 0) held.colliderIds.push(id);
      }
      step('add', now() - tb);
      this.stats.colliders = (block.stats.colliders || 0) + held.colliderIds.length;
      this.stats.tris = Math.round(tris);
      this.stats.draws = held.tiles.length + 4 + block.stats.draws + 2 + steam.counts.draws + 2;   // (wave 3) + the Brazier's stone and ash
      this.stats.totalMs = Math.round(now() - t0);
      this.stats.builds++;
      const ds = now() - sliceT;
      if (ds > this.stats.worstSliceMs) this.stats.worstSliceMs = Math.round(ds * 10) / 10;
      this._held = held;
      this.state = 'ready';
      this.update();
      return true;
    } catch (err) {
      this._dispose(held);
      if (err instanceof CancelBuild) return false;
      throw err;
    }
  }

  /** Each frame: the clinker's tiles past CLINKER.far from the camera are hidden (the ground's texture carries them). */
  update() {
    const H = this._held;
    if (!H) return;
    H.block?.update();
    if (this._switch.steam) H.steam?.update(this.ctx.environment);
    const cam = this.ctx.camera?.position;
    if (!cam) return;
    const far = CLINKER.far, on = this._switch.rock;
    for (const t of H.tiles) t.mesh.visible = on && Math.hypot(t.x - cam.x, t.z - cam.z) - t.r < far;
  }

  /** Take the region down (region-depart; a build in progress is cancelled at its next step). */
  release() {
    this._gen++;
    if (this.state === 'building') { this.state = 'cold'; return; }
    if (this._held) { this._dispose(this._held); this._held = null; this.stats.releases++; }
    this.state = 'cold';
  }

  _dispose(H) {
    const T = this.terrain;
    if (H.group) H.group.parent?.remove(H.group);
    if (H.ground && T._malpaisGround === H.ground) T.setMalpaisGround?.(null);
    if (T.kilnYards?.group) T.kilnYards.group.visible = true;
    if (H.colliderIds?.length && this.ctx.collision?.unregister) this.ctx.collision.unregister(H.colliderIds);
    H.colliderIds = [];
    H.block?.dispose();
    H.kit?.dispose();
    H.steam?.dispose();
    if (H.brazier) { H.brazier.group.parent?.remove(H.brazier.group); H.brazier.group.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); }); }
    for (const t of H.tiles || []) t.mesh.dispose?.();
    for (const g of H.geos) g.dispose();
    for (const m of H.mats) m.dispose();
    for (const t of H.textures) t.dispose();
  }

  /** Paired-readback switches (the term's and the rock's own cost: MP4, MP10). */
  perfSwitches() {
    const T = this.terrain;
    return [
      { id: 'malpais-ground', on: () => { this._switch.ground = true; if (this._held) T.setMalpaisGround?.(this._held.ground); }, off: () => { this._switch.ground = false; T.setMalpaisGround?.(null); } },
      { id: 'malpais-rock', on: () => { this._switch.rock = true; this.update(); for (const n of ['malpais-pinnacles', 'malpais-hornitos', 'malpais-ridges', 'malpais-tube']) { const o = this._held?.group?.getObjectByName(n); if (o) o.visible = true; } },
        off: () => { this._switch.rock = false; this.update(); for (const n of ['malpais-pinnacles', 'malpais-hornitos', 'malpais-ridges', 'malpais-tube']) { const o = this._held?.group?.getObjectByName(n); if (o) o.visible = false; } } },
      { id: 'malpais-steam', on: () => { this._switch.steam = true; if (this._held?.steam) this._held.steam.group.visible = true; }, off: () => { this._switch.steam = false; if (this._held?.steam) this._held.steam.group.visible = false; } },
      { id: 'malpais-kit', on: () => { if (this._held?.kit) this._held.kit.group.visible = true; }, off: () => { if (this._held?.kit) this._held.kit.group.visible = false; } },
      // (M3 wave 3, MP4 "costs <= 0.15 ms* GPU in frame", per source) one plume at a time: 'on' draws that source's plume
      // alone (steam.solo: the same material, the same clock), 'off' draws no steam; on - off is the source's cost
      ...STEAM.map((src) => {
        const only = (id) => {
          const st = this._held?.steam;
          if (!st) return;
          const solo = id ? st.solo(id) : null;
          st.group.visible = true;
          for (const m of st.group.children) m.visible = m === solo;
        };
        return { id: `malpais-steam:${src.id}`, on: () => only(src.id), off: () => only(null) };
      }),
      { id: 'malpais-steam-restore', on: () => { const st = this._held?.steam; if (st) for (const m of st.group.children) m.visible = !m.name.startsWith('malpais-steam-solo-'); }, off: () => {} },
    ];
  }

  dispose() {
    const ev = this.ctx.events;
    for (const [t, f] of this._listeners) ev?.off?.(t, f);
    this._listeners = [];
    this.release();
  }
}

class CancelBuild extends Error { constructor() { super('cancelled'); this.name = 'CancelBuild'; } }
