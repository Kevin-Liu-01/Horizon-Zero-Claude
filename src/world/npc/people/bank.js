import * as THREE from 'three';
import { disposeObjectTree } from '../../../core/assets.js';

/**
 * CALIMA · the NPC bank (settlements; R56; plan §4.1, §4.4, gates A-npc-atlas-resident, A-npc-dispose).
 *
 * What people share, loaded on demand, reference counted, disposed at zero:
 *   the clip pack             public/models/npc/clips.glb (kept while the system lives)
 *   an archetype              public/models/npc/<id>.glb  (geometry for every tier + its own skin maps)
 *   a faction atlas           public/models/npc/atlas-<faction>.glb (<= 4 resident)
 *   the hair + wrap atlas     public/models/npc/atlas-hair.glb
 *
 * Every shared material here is one program: the tier cross-fade's dither and the hero fill's vertex
 * tint are compiled in once, so a tier change never compiles anything. A fade is a material swap from
 * a small pool of quantised levels (FADE_LEVELS in, FADE_LEVELS out): no per-frame allocation, and a
 * MeshStandardMaterial cannot take a per-draw uniform.
 */
export const FADE_LEVELS = 8;
const NPC_URL = (f) => `/models/npc/${f}.glb`;
/** Noon's ambient (hemisphere intensity x colour luminance): the fill is full from here up (R59 c; same number as src/hero). */
const FILL_AMBIENT_REF = 0.155;

function patch(mat, fadeU) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNpcFade = fadeU;
    shader.fragmentShader = `uniform float uNpcFade;\n${shader.fragmentShader}`
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
#if defined( USE_COLOR_ALPHA )
  totalEmissiveRadiance *= vColor.rgb;
#elif defined( USE_COLOR )
  totalEmissiveRadiance *= vColor;
#endif`)
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
  if (uNpcFade < 0.999) {
    float npcD = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (uNpcFade >= 0.0 ? npcD >= uNpcFade : npcD < -uNpcFade) discard;
  }`);
  };
  mat.customProgramCacheKey = () => 'npc-people-1';
  return mat;
}

export class NpcBank {
  constructor(ctx) {
    this.ctx = ctx;
    this.entries = new Map();      // id -> { refs, scene, extras, skinMats, promise }
    this.atlases = new Map();      // faction -> { refs, scene, material, promise }
    this.clipPack = null;
    this.clipPromise = null;
    /** Every live material (base + fade pool), for the fill's once-per-tick write. */
    this.liveMats = new Set();
    this.casterMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });
    this.casterMat.name = 'npc-caster';
    this._fillT = 0;
    this._fillK = -1;
  }

  /* ------------------------------------------------------------------ materials */

  /** The one patched program + a fade uniform; registered with the sky's cascades and fog. */
  _own(mat) {
    const fadeU = { value: 1 };
    mat.userData.npcFade = fadeU;
    mat.userData.npcPool = null;
    mat.side = THREE.FrontSide;
    patch(mat, fadeU);
    this.ctx.environment?.registerMaterial?.(mat);
    mat.needsUpdate = true;
    this.liveMats.add(mat);
    return mat;
  }

  /** The base material at fade `level` (1..FADE_LEVELS-1, `dir` 1 fading in, -1 fading out). */
  fadeOf(base, level, dir) {
    const pool = base.userData.npcPool || (base.userData.npcPool = new Array(FADE_LEVELS * 2).fill(null));
    const k = (dir > 0 ? 0 : FADE_LEVELS) + level;
    let m = pool[k];
    if (m) return m;
    m = base.clone();
    m.name = `${base.name}-fade`;
    const u = { value: dir > 0 ? level / FADE_LEVELS : -(1 - (FADE_LEVELS - level) / FADE_LEVELS) };
    // fading in shows the first `level / N` of the dither; fading out hides the same share (the two never overlap)
    u.value = dir > 0 ? level / FADE_LEVELS : -(level / FADE_LEVELS);
    m.userData = { npcFade: u, npcBase: base };
    patch(m, u);
    this.ctx.environment?.registerMaterial?.(m);
    m.needsUpdate = true;
    pool[k] = m;
    this.liveMats.add(m);
    return m;
  }

  _disposeMat(mat) {
    const pool = mat.userData?.npcPool;
    if (pool) for (const m of pool) if (m) { this.liveMats.delete(m); m.dispose(); }
    this.liveMats.delete(mat);
    mat.dispose();
  }

  /** R59 c: the fill follows the scene's ambient, so it is gone at night. A few times a second, no allocation. */
  tickFill(dt) {
    this._fillT -= dt;
    if (this._fillT > 0) return;
    this._fillT = 0.3;
    const hemi = this.ctx.environment?.hemi;
    if (!hemi) return;
    const k = Math.min(1, hemi.intensity * (0.2126 * hemi.color.r + 0.7152 * hemi.color.g + 0.0722 * hemi.color.b) / FILL_AMBIENT_REF);
    if (Math.abs(k - this._fillK) < 0.01) return;
    this._fillK = k;
    for (const m of this.liveMats) m.emissiveIntensity = k;
  }

  /* -------------------------------------------------------------------- clips */

  /** The clip pack: name -> AnimationClip; native clips are copied once per body with the pelvis scaled. */
  loadClips() {
    if (this.clipPack) return Promise.resolve(this.clipPack);
    if (this.clipPromise) return this.clipPromise;
    this.clipPromise = this.ctx.assets.loader.loadAsync(NPC_URL('clips')).then((gltf) => {
      const ex = gltf.parser?.json?.asset?.extras?.r5Clips || {};
      const byName = new Map();
      for (const c of gltf.animations) byName.set(c.name, c);
      const pelvis = ex.pelvisScale || { F: 1, M: 1 };
      const of = (sex, name) => {
        const key = `${sex}|${name}`;
        let c = byName.get(key);
        if (c) return c;
        const base = byName.get(name);
        if (!base) return null;
        c = base.clone();
        c.name = key;
        for (const tr of c.tracks) if (tr.name === 'pelvis.position') for (let i = 0; i < tr.values.length; i++) tr.values[i] *= pelvis[sex] || 1;
        byName.set(key, c);
        return c;
      };
      this.clipPack = { of, gaits: ex.gaits || {}, names: [...byName.keys()] };
      disposeObjectTree(gltf.scene);
      return this.clipPack;
    });
    return this.clipPromise;
  }

  /** A clip's mean upper-arm pose (the walk style's arm-swing gain slerps toward it). Computed once, kept with the pack. */
  armMean(sex, name) {
    const key = `${sex}|${name}`;
    this._armMeans ||= new Map();
    if (this._armMeans.has(key)) return this._armMeans.get(key);
    const clip = this.clipPack.of(sex, name);
    const mean = (bone) => {
      const tr = clip.tracks.find((t) => t.name === `${bone}.quaternion`);
      if (!tr) return new THREE.Quaternion();
      const v = tr.values, q = new THREE.Vector4();
      for (let i = 0; i < v.length; i += 4) { const s = v[i] * v[0] + v[i + 1] * v[1] + v[i + 2] * v[2] + v[i + 3] * v[3] < 0 ? -1 : 1; q.x += s * v[i]; q.y += s * v[i + 1]; q.z += s * v[i + 2]; q.w += s * v[i + 3]; }
      q.normalize();
      return new THREE.Quaternion(q.x, q.y, q.z, q.w);
    };
    const m = { l: mean('upperarm_l'), r: mean('upperarm_r') };
    this._armMeans.set(key, m);
    return m;
  }

  /* ------------------------------------------------------------------- atlases */

  acquireAtlas(key) {
    let a = this.atlases.get(key);
    if (a) { a.refs++; return a.promise; }
    a = { refs: 1, key, scene: null, material: null, promise: null };
    a.promise = this.ctx.assets.loader.loadAsync(NPC_URL(`atlas-${key}`)).then((gltf) => {
      a.scene = gltf.scene;
      let mat = null;
      gltf.scene.traverse((o) => { if (o.isMesh && !mat) mat = o.material; });
      mat.name = `npc-atlas-${key}`;
      mat.vertexColors = true;
      a.material = this._own(mat);
      return a;
    });
    this.atlases.set(key, a);
    return a.promise;
  }

  releaseAtlas(key) {
    const a = this.atlases.get(key);
    if (!a) return;
    if (--a.refs > 0) return;
    this.atlases.delete(key);
    if (a.material) this._disposeMat(a.material);
    if (a.scene) disposeObjectTree(a.scene);
  }

  /** The faction atlases resident now (the hair atlas is its own row). */
  residentAtlases() { return [...this.atlases.keys()].filter((k) => k !== 'hair'); }

  /* ----------------------------------------------------------------- archetypes */

  acquire(id) {
    let e = this.entries.get(id);
    if (e) { e.refs++; return e.promise; }
    e = { id, refs: 1, scene: null, extras: null, npc: null, skinMat: null, faction: null, promise: null };
    e.promise = (async () => {
      const gltf = await this.ctx.assets.loader.loadAsync(NPC_URL(id));
      const ex = gltf.parser?.json?.asset?.extras || {};
      e.extras = ex;
      e.npc = ex.r5Npc;
      e.faction = ex.r5Npc?.faction;
      e.scene = gltf.scene;
      gltf.scene.traverse((o) => {
        if (o.isSkinnedMesh && /^Skin_/.test(o.name) && !e.skinMat) e.skinMat = o.material;
      });
      e.skinMat.name = `npc-skin-${id}`;
      this._own(e.skinMat);
      // both atlases are held for as long as the archetype is
      await Promise.all([this.acquireAtlas(e.faction), this.acquireAtlas('hair')]);
      return e;
    })();
    this.entries.set(id, e);
    return e.promise;
  }

  release(id) {
    const e = this.entries.get(id);
    if (!e) return;
    if (--e.refs > 0) return;
    this.entries.delete(id);
    if (e.skinMat) this._disposeMat(e.skinMat);
    if (e.scene) disposeObjectTree(e.scene);
    if (e.faction) this.releaseAtlas(e.faction);
    this.releaseAtlas('hair');
  }

  dispose() {
    for (const id of [...this.entries.keys()]) { const e = this.entries.get(id); e.refs = 1; this.release(id); }
    for (const k of [...this.atlases.keys()]) { const a = this.atlases.get(k); a.refs = 1; this.releaseAtlas(k); }
    this.casterMat.dispose();
    this.clipPack = null; this.clipPromise = null;
  }
}
