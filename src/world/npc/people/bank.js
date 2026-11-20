import * as THREE from 'three';
import { disposeObjectTree } from '../../../core/assets.js';
import { installCloth } from '../../../hero/clothShader.js';
import { applySkinLook } from '../../../hero/skinLook.js';
import { installFaceGeometry } from './face.js';

/**
 * CALIMA · the NPC bank (settlements; R56; plan §4.1, §4.4, gates A-npc-atlas-resident, A-npc-dispose).
 *
 * What people share, loaded on demand, reference counted, disposed at zero:
 *   the clip pack             public/models/npc/npc-clips.glb (kept while the system lives)
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

/**
 * `pre` (M1.5b): a dress on a sheet of its own carries Brea's cloth shading (src/hero/clothShader.js: the weave, grain and
 * brass detail tiled at her size, the cloth rim), run before the fade and fill; it is its own program.
 */
function patch(mat, fadeU, pre = null, key = null) {
  mat.onBeforeCompile = (shader) => {
    if (pre) pre(shader);
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
  mat.customProgramCacheKey = key ? () => key : pre ? () => 'npc-people-1-cloth' : () => 'npc-people-1';
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
    /** base material -> its own program key, when its hook makes a program of its own (the skin light) */
    this.preKeys = new WeakMap();
    /** base material -> its fade pool; any material -> its fade uniform (userData is JSON-cloned by Material.copy: not there). */
    this.pools = new Map();
    this.fadeU = new WeakMap();
    /** base material -> the cloth hook its program runs first (a dress with its own sheet) */
    this.preHooks = new WeakMap();
    this.casterMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });
    this.casterMat.name = 'npc-caster';
    this._fillT = 0;
    this._fillK = -1;
  }

  /* ------------------------------------------------------------------ materials */

  /** The one patched program + a fade uniform; registered with the sky's cascades and fog. */
  _own(mat, pre = null, key = null) {
    const fadeU = { value: 1 };
    this.fadeU.set(mat, fadeU);
    mat.side = THREE.FrontSide;
    if (pre) this.preHooks.set(mat, pre);
    if (key) this.preKeys.set(mat, key);
    patch(mat, fadeU, pre, key);
    this.ctx.environment?.registerMaterial?.(mat);
    mat.needsUpdate = true;
    this.liveMats.add(mat);
    return mat;
  }

  /** The base material at fade `level` (1..FADE_LEVELS-1, `dir` 1 fading in, -1 fading out). */
  fadeOf(base, level, dir) {
    let pool = this.pools.get(base);
    if (!pool) { pool = new Array(FADE_LEVELS * 2).fill(null); this.pools.set(base, pool); }
    const k = (dir > 0 ? 0 : FADE_LEVELS) + level;
    let m = pool[k];
    if (m) return m;
    // C5 (engine lane, the smallest change here: the first hour's hitches): cloned with its userData held aside and given
    // back as a shallow copy. Material.copy deep-copies userData through JSON, and a skin's userData.calSkinU holds the
    // skin look's DataTextures (src/hero/skinLook.js), whose toJSON writes out their pixels: 161 ms of the first 30 s of
    // first-hour leg 2 at 865e8c6 went to that (run hh-c5-865e8c6), a frame at a time as people changed tier. Nothing
    // reads a fade's own copy (its program takes its uniforms from the hooks below).
    const ud = base.userData;
    base.userData = {};
    try { m = base.clone(); } finally { base.userData = ud; }
    m.userData = { ...ud };
    m.name = `${base.name}-fade`;
    // fading in shows the first `level / N` of the dither; fading out hides the same share (the two never overlap)
    const u = { value: dir > 0 ? level / FADE_LEVELS : -(level / FADE_LEVELS) };
    this.fadeU.set(m, u);
    patch(m, u, this.preHooks.get(base) || null, this.preKeys.get(base) || null);
    this.ctx.environment?.registerMaterial?.(m);
    m.needsUpdate = true;
    pool[k] = m;
    this.liveMats.add(m);
    return m;
  }

  _disposeMat(mat) {
    const pool = this.pools.get(mat);
    if (pool) for (const m of pool) if (m) { this.liveMats.delete(m); m.dispose(); }
    this.pools.delete(mat);
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
    this.clipPromise = this.ctx.assets.loader.loadAsync(NPC_URL('npc-clips')).then((gltf) => {
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
    e = { id, refs: 1, scene: null, extras: null, npc: null, skinMat: null, outfitMat: null, ownOutfit: false, faction: null, promise: null };
    e.promise = (async () => {
      const gltf = await this.ctx.assets.loader.loadAsync(NPC_URL(id));
      const ex = gltf.parser?.json?.asset?.extras || {};
      e.extras = ex;
      e.npc = ex.r5Npc;
      e.faction = ex.r5Npc?.faction;
      e.scene = gltf.scene;
      // M1.5f: the face rig on the near skin, once per archetype (every person of it shares the geometry)
      gltf.scene.traverse((o) => { if (o.isSkinnedMesh && o.name === 'Skin_L0') installFaceGeometry(o, ex.r5Paint?.layout?.eyePatch); });
      gltf.scene.traverse((o) => {
        if (o.isSkinnedMesh && /^Skin_/.test(o.name) && !e.skinMat) e.skinMat = o.material;
        if (o.isSkinnedMesh && o.name === 'Outfit_L0' && !e.outfitMat) e.outfitMat = o.material;
      });
      e.skinMat.name = `npc-skin-${id}`;
      // M1.5b round 2 (TECH §6: every shader written for Brea applies to NPCs unchanged): Brea's skin light (pre-integrated
      // scattering, the dual lobe, the pores, the ears' transmission, the wet cornea) on every person's skin. The near tier carries the
      // recipe's baked _CALTHIN / _CALZONE (lib/human: bakeThinness, bakeZones); a far tier, or a person built before them, gets
      // zeros (no pore detail, no transmission, skin everywhere), so a tier change keeps the same light
      const tier = this.ctx.engine?.quality || 'high';
      gltf.scene.traverse((o) => {
        if (!o.isSkinnedMesh || !/^Skin_/.test(o.name)) return;
        const g = o.geometry, n = g.getAttribute('position').count;
        if (!g.getAttribute('_calzone')) g.setAttribute('_calzone', new THREE.BufferAttribute(new Uint8Array(n * 4), 4, true));
        if (!g.getAttribute('_calthin')) g.setAttribute('_calthin', new THREE.BufferAttribute(new Uint8Array(n), 1, true));
      });
      applySkinLook(e.skinMat, { tier });
      const skinHook = e.skinMat.onBeforeCompile, skinMat = e.skinMat;
      this._own(e.skinMat, (shader) => skinHook.call(skinMat, shader), `npc-people-1-skin${tier === 'low' ? 'l' : ''}`);
      // M1.5b: a dress on a sheet of its own (Ansel) keeps its own material, with Brea's cloth shading; any other person
      // wears the faction atlas, resolved here
      const own = e.npc?.outfitAtlas?.own && e.outfitMat?.map ? e.npc.outfitAtlas : null;
      if (own) {
        const m = e.outfitMat;
        m.name = `npc-outfit-${id}`;
        m.vertexColors = true;
        installCloth(m, { rep: own.detailRep ?? 100 });
        this._own(m, m.userData.vertexHook);
        e.ownOutfit = true;
      } else e.outfitMat = null;
      // the atlases are held for as long as the archetype is
      await Promise.all([...(e.ownOutfit ? [] : [this.acquireAtlas(e.faction)]), this.acquireAtlas('hair')]);
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
    if (e.outfitMat) this._disposeMat(e.outfitMat);
    if (e.scene) disposeObjectTree(e.scene);
    if (e.faction && !e.ownOutfit) this.releaseAtlas(e.faction);
    this.releaseAtlas('hair');
  }

  dispose() {
    for (const id of [...this.entries.keys()]) { const e = this.entries.get(id); e.refs = 1; this.release(id); }
    for (const k of [...this.atlases.keys()]) { const a = this.atlases.get(k); a.refs = 1; this.releaseAtlas(k); }
    this.casterMat.dispose();
    this.clipPack = null; this.clipPromise = null;
  }
}
